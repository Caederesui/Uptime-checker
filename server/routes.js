import express from "express";
import pool from "./db.js";
import { locationGroups } from "./httpCheck.js";

const router = express.Router();

router.get("/http-logs", async (req, res) => {
    try {
        const { timeRange, domain } = req.query;
        let interval;
        let tableName;

        switch (timeRange) {
            case "month":
                interval = "30 day";
                tableName = "http_hourly_logs";
                break;
            case "week":
                interval = "7 day";
                tableName = "http_hourly_logs";
                break;
            case "day":
                interval = "1 day";
                tableName = "http_logs";
                break;
            case "3hour":
                interval = "3 hour";
                tableName = "http_logs";
                break;
            default:
                // Default to 3 hours, detailed logs
                interval = "3 hour";
                tableName = "http_logs";
        }

        let query;
        let params;

        // Columns required for the response
        const columns = `country, city, status_code, created_at, total_time, download_time, first_byte_time, dns_time, tls_time, tcp_time`;

        if (domain) {
            query = `
        SELECT
          ${columns}
        FROM ${tableName}
        WHERE created_at >= NOW() - $1::interval AND city IS NOT NULL AND domain = $2
        ORDER BY created_at ASC;
      `;
            params = [interval, domain];
        } else {
            query = `
        SELECT
          domain, ${columns}
        FROM ${tableName}
        WHERE created_at >= NOW() - $1::interval AND city IS NOT NULL
        ORDER BY created_at ASC;
      `;
            params = [interval];
        }

        const { rows } = await pool.query(query, params);

        if (domain) {
            const logsByCountryCity = {};
            for (const row of rows) {
                const { country, city, ...logData } = row;
                if (!logsByCountryCity[country]) {
                    logsByCountryCity[country] = {};
                }
                if (!logsByCountryCity[country][city]) {
                    logsByCountryCity[country][city] = [];
                }
                logsByCountryCity[country][city].push(logData);
            }
            res.json(logsByCountryCity);
        } else {
            res.json(rows);
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("Server Error");
    }
});

router.get("/locations", (req, res) => {
    res.json(locationGroups);
});

export default router;