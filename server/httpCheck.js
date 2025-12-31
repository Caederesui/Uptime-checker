import pool from "./db.js";
import fetch from "node-fetch";

const domains = [
    { name: "site.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY" },
    { name: "ru.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY2" },
    { name: "en.yummyani.me", apiKeyEnv: "GLOBALPING_API_KEY3" },
    { name: "site.yummy-ani.me", apiKeyEnv: "GLOBALPING_API_KEY4" },
];

export const locationGroups = {
    "2min": [
        { country: "RU", city: "Moscow" },
        { country: "RU", city: "Saint Petersburg" },
        { country: "RU", city: "Yekaterinburg" },
        { country: "UA", city: "Kyiv" },
        { country: "UA", city: "Lviv" },
        { country: "UA", city: "Odesa" },
        { country: "KZ", city: "Almaty" },
        { country: "KZ", city: "Karagandy" },
        { country: "KZ", city: "Aktau" },
        { country: "BY", city: "Minsk" },
    ],
    "6min": [
        { country: "DE", city: "Berlin" },
        { country: "DE", city: "Dusseldorf" }, 
        { country: "KG", city: "Bishkek" },
        { country: "PL", city: "Warsaw" }, 
        { country: "PL", city: "Krakow" }, 
        { country: "LV", city: "Riga" },
        { country: "LT", city: "Vilnius" },
        { country: "LT", city: "Siauliai" },
        { country: "EE", city: "Tallinn" },
        { country: "US", city: "New York" },
        { country: "US", city: "Los Angeles" },
        { country: "NL", city: "Amsterdam" },
        { country: "NL", city: "Utrecht" },
        { country: "GB", city: "London" },
        { country: "GB", city: "Woking" },
        { country: "MD", city: "Chisinau" },
        { country: "CZ", city: "Prague" },
        { country: "CZ", city: "Brno" },
        { country: "GE", city: "Tbilisi" },
        { country: "AM", city: "Yerevan" },
    ],
};

export const aggregateHourlyData = async () => {
    console.log(`--- Starting hourly aggregation at ${new Date().toISOString()} ---`);
    try {
        const query = `
            INSERT INTO http_hourly_logs (
                domain, country, city, status_code, total_time, download_time,
                first_byte_time, dns_time, tls_time, tcp_time, created_at
            )
            SELECT
                domain,
                country,
                city,
                MODE() WITHIN GROUP (ORDER BY status_code) AS status_code,
                AVG(total_time) AS total_time,
                AVG(download_time) AS download_time,
                AVG(first_byte_time) AS first_byte_time,
                AVG(dns_time) AS dns_time,
                AVG(tls_time) AS tls_time,
                AVG(tcp_time) AS tcp_time,
                date_trunc('hour', NOW()) AS created_at
            FROM http_logs
            WHERE created_at >= NOW() - INTERVAL '1 hour'
            GROUP BY domain, country, city;
        `;

        await pool.query(query);
        console.log('Hourly aggregation completed successfully.');
    } catch (err) {
        console.error('Error during hourly aggregation:', err);
    }
};

export const httpCheckAndSave = async (locations) => {
    console.log(
        `--- Starting HTTP check cycle at ${new Date().toISOString()} for ${
            locations.length
        } locations ---`
    );
    for (const domain of domains) {
        const target = domain.name;
        const apiKey = process.env[domain.apiKeyEnv];
        if (!apiKey) {
            console.error(`${domain.apiKeyEnv} is not set.`);
            continue;
        }

        if (!target) {
            console.error("Target is not defined");
            continue;
        }
        try {
            // Step 1: Create the measurement
            const requestOptions = {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    target: target,
                    locations: locations.map((location) => ({
                        ...location,
                        limit: 1,
                    })),
                    type: "http",
                    measurementOptions: {
                        protocol: "HTTPS",
                    },
                }),
            };
            const createMeasurementResponse = await fetch(
                "https://api.globalping.io/v1/measurements",
                requestOptions
            );

            if (!createMeasurementResponse.ok) {
                const errorBody = await createMeasurementResponse.text();
                console.error(
                    `Failed to create measurement: ${createMeasurementResponse.status} ${createMeasurementResponse.statusText}. Body: ${errorBody}`
                );
                if (createMeasurementResponse.status === 429) {
                    for (const location of locations) {
                        const query = `
      INSERT INTO http_logs (
        probe_id, domain, country, city, asn, network, status_code, total_time, download_time, first_byte_time, dns_time, tls_time, tcp_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;
                        await pool.query(query, [
                            "api_limit",
                            target,
                            location.country,
                            location.city,
                            null,
                            null,
                            429,
                            null,
                            null,
                            null,
                            null,
                            null,
                            null,
                        ]);
                    }
                }
                continue;
            }

            const { id } = await createMeasurementResponse.json();
            console.log(`[HTTP] Measurement created with ID: ${id}`);

            // Step 2 & 3: Poll for the measurement result until it's finished
            let resultData;
            const startTime = Date.now();
            const timeout = 30000; // 30 seconds timeout

            while (Date.now() - startTime < timeout) {
                const getResultResponse = await fetch(
                    `https://api.globalping.io/v1/measurements/${id}`
                );

                if (!getResultResponse.ok) {
                    if (getResultResponse.status >= 500) {
                        await new Promise((resolve) =>
                            setTimeout(resolve, 2000)
                        );
                        continue;
                    }
                    throw new Error(
                        `HTTP error! status: ${getResultResponse.status}`
                    );
                }

                resultData = await getResultResponse.json();

                if (resultData.status === "finished") {
                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, 2000));
            }

            if (!resultData || resultData.status !== "finished") {
                throw new Error(`Measurement ${id} did not complete in time.`);
            }

            const resultsByLocation = new Map(
                resultData.results.map((r) => [
                    `${r.probe.city}-${r.probe.country}`,
                    r,
                ])
            );

            for (const location of locations) {
                const result = resultsByLocation.get(
                    `${location.city}-${location.country}`
                );
                let values;

                if (result && result.result.status === "finished") {
                    const { probe, result: httpResult } = result;
                    console.log(
                        `[SUCCESS] HTTP check to ${probe.city}, ${probe.country}: Status ${httpResult.statusCode}`
                    );
                    values = [
                        id,
                        target,
                        probe.country,
                        probe.city,
                        probe.asn,
                        probe.network,
                        httpResult.statusCode,
                        httpResult.timings.total || null,
                        httpResult.timings.download || null,
                        httpResult.timings.firstByte || null,
                        httpResult.timings.dns || null,
                        httpResult.timings.tls || null,
                        httpResult.timings.tcp || null,
                    ];
                } else {
                    console.log(
                        `[FAILURE] HTTP check to ${location.city}, ${
                            location.country
                        }: Status ${
                            result
                                ? result.result.status.toUpperCase()
                                : "UNKNOWN"
                        }`
                    );
                    values = [
                        id,
                        target,
                        location.country,
                        location.city,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                        null,
                    ];
                }

                const query = `
      INSERT INTO http_logs (
        probe_id, domain, country, city, asn, network, status_code, total_time, download_time, first_byte_time, dns_time, tls_time, tcp_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;

                await pool.query(query, values);
            }
            console.log(
                `--- HTTP check cycle for measurement ${id} completed. ---`
            );
        } catch (err) {
            console.error(
                "Failed to complete HTTP measurement cycle:",
                err.message
            );
            for (const location of locations) {
                const query = `
      INSERT INTO http_logs (
        probe_id, domain, country, city, asn, network, status_code, total_time, download_time, first_byte_time, dns_time, tls_time, tcp_time
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `;
                await pool.query(query, [
                    "failed",
                    target,
                    location.country,
                    location.city,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                ]);
            }
        }
    }
};