import { useState, useEffect } from "react";
import { NavLink, useParams } from "react-router-dom";
import styles from "./Dashboard.module.scss";
import CountryChart from "../CountryChart/CountryChart.tsx";
import CountryChartPlug from "../CountryChart/CountryChartPlug.tsx";
import ReactCountryFlag from "react-country-flag";
import { countries, domains } from "../../data/constants.ts";
import ButtonGroup from "../ButtonGroup/ButtonGroup.tsx";
import Status from "../Status/Status.tsx";
import { useDataStatus } from "../../context/DataStatusContext.tsx";
import ToggleSwitch from "../ToggleSwitch/ToggleSwitch.tsx";

interface Log {
    created_at: string;
    domain?: string;
    country?: string;
    city?: string;
    status_code?: number;
    total_time?: number;
    download_time?: number;
    first_byte_time?: number;
    dns_time?: number;
    tls_time?: number;
    tcp_time?: number;
    unreliable?: boolean;
}

interface CityLogs {
    [city: string]: Log[];
}

interface CountryLogs {
    [country: string]: CityLogs;
}

interface Location {
    country: string;
    city: string;
}

interface LocationGroups {
    [interval: string]: Location[];
}

const Dashboard = () => {
    const allowedCountries = ["RU", "UA", "BY"];
    const [httpLogs, setHttpLogs] = useState<CountryLogs>({});
    const [locationGroups, setLocationGroups] = useState<LocationGroups>({});
    const [domainLogs, setDomainLogs] = useState<{
        [domain: string]: CityLogs;
    }>({});
    const [loading, setLoading] = useState(true);
    const [isChartLoading, setChartLoading] = useState(false);
    const { setStatus } = useDataStatus();
    const [timeRange, setTimeRange] = useState(
        () => localStorage.getItem("timeRange") || "3hour"
    );
    const { domain } = useParams<{ domain: string }>();
    const [hideUnreliable, setHideUnreliable] = useState(false);

    const timeRangeOptions = [
		{ value: "3hour", label: "3 часа" },
		{ value: "day", label: "День" },
		{ value: "week", label: "Неделя" },
        { value: "month", label: "Месяц" },
    ];

    // Обрезает логи, чтобы все города/страны начинались и заканчивались одновременно.
    const trimCityLogsByTimeRange = (cityLogsMap: CityLogs) => {
        let minTime = Infinity;
        let maxTime = -Infinity;

        // 1. Найти общий минимальный и максимальный CreatedAt среди всех городов
        for (const city in cityLogsMap) {
            const logs = cityLogsMap[city];
            if (logs.length > 0) {
                const firstTime = new Date(logs[0].created_at).getTime();
                const lastTime = new Date(logs[logs.length - 1].created_at).getTime();

                minTime = Math.min(minTime, firstTime);
                maxTime = Math.max(maxTime, lastTime);
            }
        }

        if (minTime === Infinity || maxTime === -Infinity) {
            return cityLogsMap;
        }

        // 2. Обрезать все логи по общему диапазону
        const trimmedLogs: CityLogs = {};
        for (const city in cityLogsMap) {
            trimmedLogs[city] = cityLogsMap[city].filter((log) => {
                const logTime = new Date(log.created_at).getTime();
                return logTime >= minTime && logTime <= maxTime;
            });
        }

        return trimmedLogs;
    };

    const fetchData = async () => {
        try {
            let logsData: CountryLogs = {};
            let domainLogsData: { [domain: string]: CityLogs } = {};

            if (domain) {
                const [logsResponse, locationsResponse] = await Promise.all([
                    fetch(`/http-logs?timeRange=${timeRange}&domain=${domain}`),
                    fetch("/locations"),
                ]);

                if (!logsResponse.ok) {
                    throw new Error(
                        `HTTP error! status: ${logsResponse.status}`
                    );
                }
                if (!locationsResponse.ok) {
                    throw new Error(
                        `HTTP error! status: ${locationsResponse.status}`
                    );
                }

                logsData = await logsResponse.json();
                // Обрезка для детальной страницы (нужно обрезать все города внутри каждой страны)
                const processedLogsData: CountryLogs = {};
                for (const countryKey in logsData) {
                    processedLogsData[countryKey] = trimCityLogsByTimeRange(logsData[countryKey]);
                }
                logsData = processedLogsData;
                
                const locationsData: LocationGroups =
                    await locationsResponse.json();
                setLocationGroups(locationsData);
            } else {
                const response = await fetch(
                    `/http-logs?timeRange=${timeRange}`
                );
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data: Log[] = await response.json();
                const filteredData = data.filter(
                    (log) =>
                        log.country && allowedCountries.includes(log.country)
                );

                const rawGroupedByDomain = filteredData.reduce(
                    (acc, log) => {
                        if (log.domain && log.city) {
                            const domain = log.domain;
                            const city = log.city;
                            if (!acc[domain]) {
                                acc[domain] = {};
                            }
                            if (!acc[domain][city]) {
                                acc[domain][city] = [];
                            }
                            acc[domain][city].push(log);
                        }
                        return acc;
                    },
                    {} as { [domain: string]: CityLogs }
                );

                // Применяем обрезку к каждому домену
                for (const domainKey in rawGroupedByDomain) {
                    const logsForDomain = rawGroupedByDomain[domainKey];
                    domainLogsData[domainKey] = trimCityLogsByTimeRange(logsForDomain);
                }
                setDomainLogs(domainLogsData);
            }

            if (hideUnreliable) {
                const filteredLogs: CountryLogs = {};
                for (const country in logsData) {
                    filteredLogs[country] = {};
                    for (const city in logsData[country]) {
                        const cityLogs = logsData[country][city];
                        const processedLogs = cityLogs.map((log, i) => {
                            if ((log.total_time ?? 0) > 5000) {
                                const prev = cityLogs[i - 1];
                                const next = cityLogs[i + 1];
                                if (
                                    (prev?.total_time ?? 0) < 5000 &&
                                    (next?.total_time ?? 0) < 5000
                                ) {
                                    return {
                                        ...prev,
                                        unreliable: true,
                                    };
                                }
                            }
                            return log;
                        });
                        filteredLogs[country][city] = processedLogs.filter(
                            (log) => (log.total_time ?? 0) < 5000
                        );
                    }
                }
                setHttpLogs(filteredLogs);
            } else {
                setHttpLogs(logsData);
            }
            setStatus("dashboard", "success");
        } catch (e: any) {
            if (
                Object.keys(httpLogs).length > 0 ||
                Object.keys(domainLogs).length > 0
            ) {
                setStatus("dashboard", "stale");
            } else {
                setStatus("dashboard", "error");
            }
        } finally {
            setLoading(false);
        }
    };
    
    useEffect(() => {
        setLoading(true);
        setStatus("dashboard", "loading");
        fetchData();
    }, [domain]);

    useEffect(() => {
        setChartLoading(true);
        fetchData().finally(() => setChartLoading(false));
    }, [timeRange, hideUnreliable]);

    useEffect(() => {
        const intervalId = setInterval(fetchData, 30000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                fetchData();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );
        };
    }, [domain, timeRange]);

    useEffect(() => {
        localStorage.setItem("timeRange", timeRange);
    }, [timeRange]);

    if (!domain) {
        return (
            <div className={styles.dashboard}>
                <div className={styles.header}>
                    <div className={styles.controls}>
                        <ButtonGroup
                            options={timeRangeOptions}
                            value={timeRange}
                            onChange={setTimeRange}
                        />
                         <ToggleSwitch
                            label="Скрывать недостоверные данные"
                            checked={hideUnreliable}
                            onChange={setHideUnreliable}
                        />
                    </div>
                </div>
                <Status timeRange={timeRange} />
                <div className={styles.chartsGrid}>
                    {loading
                        ? Array.from({ length: domains.length }).map(
                              (_, index) => <CountryChartPlug key={index} />
                          )
                        : Object.entries(domainLogs)
                              .map(([domain, cityLogs]) => (
                                  <div
                                      key={domain}
                                      className={styles.countryChart}
                                  >
                                      <div className={styles.countryHeader}>
                                          <p className={styles.countryName}>
                                              {domain}
                                          </p>
                                          <NavLink to={`${domain}`}>
                                              <button>Подробнее</button>
                                          </NavLink>
                                      </div>
                                      <div className={styles.chartContainer}>
                                          <CountryChart
                                              cityLogs={cityLogs}
                                              cities={Object.keys(cityLogs)}
                                              timeRange={timeRange}
                                              isChartLoading={isChartLoading}
                                          />
                                      </div>
                                  </div>
                              ))}
                </div>
            </div>
        );
    }

    return (
        <div className={styles.dashboard}>
            <div className={styles.header}>
                <div className={styles.controls}>
                    <ButtonGroup
                        options={timeRangeOptions}
                        value={timeRange}
                        onChange={setTimeRange}
                    />
                    <ToggleSwitch
                        label="Скрывать недостоверные данные"
                        checked={hideUnreliable}
                        onChange={setHideUnreliable}
                    />
                </div>
            </div>
            <Status timeRange={timeRange} domain={domain} />
            {loading ? (
                <div className={styles.chartsGrid}>
                    {Array.from({ length: 4 }).map((_, index) => (
                        <CountryChartPlug key={index} />
                    ))}
                    {Array.from({ length: 13 }).map((_, index) => (
                        <CountryChartPlug key={index} />
                    ))}
                </div>
            ) : (
                Object.entries(locationGroups).map(([interval, locations]) => {
                    const intervalMinutes = parseInt(
                        interval.replace("min", "")
                    );
                    return (
                        <div key={interval} className={styles.chartGroup}>
                            <div className={styles.chartsGrid}>
                                {locations
                                    .reduce(
                                        (acc, { country, city }) => {
                                            let countryGroup = acc.find(
                                                (g) => g.countryCode === country
                                            );
                                            if (!countryGroup) {
                                                countryGroup = {
                                                    countryCode: country,
                                                    cities: [],
                                                };
                                                acc.push(countryGroup);
                                            }
                                            countryGroup.cities.push(city);
                                            return acc;
                                        },
                                        [] as {
                                            countryCode: string;
                                            cities: string[];
                                        }[]
                                    )
                                    .sort(
                                        (a, b) =>
                                            countries.findIndex(
                                                (c) => c.code === a.countryCode
                                            ) -
                                            countries.findIndex(
                                                (c) => c.code === b.countryCode
                                            )
                                    )
                                    .map(({ countryCode, cities }) => {
                                        const country = countries.find(
                                            (c) => c.code === countryCode
                                        );
                                        const countryName = country
                                            ? country.name
                                            : countryCode;
                                        const cityLogsForCountry =
                                            httpLogs[countryCode] || {};

                                        return (
                                            <div
                                                key={countryCode}
                                                className={styles.countryChart}
                                            >
                                                <div
                                                    className={
                                                        styles.countryHeader
                                                    }
                                                >
                                                    <div
                                                        className={
                                                            styles.countryIdentifier
                                                        }
                                                    >
                                                        <ReactCountryFlag
                                                            countryCode={
                                                                countryCode
                                                            }
                                                            svg
                                                            style={{
                                                                width: "24px",
                                                                height: "16px",
                                                                borderRadius:
                                                                    "5px",
                                                            }}
                                                            title={countryName}
                                                        />
                                                        <p
                                                            className={
                                                                styles.countryName
                                                            }
                                                        >
                                                            {countryName}
                                                        </p>
                                                    </div>
                                                    <div
                                                        className={
                                                            styles.checkInterval
                                                        }
                                                        title={`Каждая проверка происходит раз в ${intervalMinutes} минут`}
                                                    >
                                                        <svg
                                                            width="16"
                                                            height="16"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="2"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        >
                                                            <circle
                                                                cx="12"
                                                                cy="12"
                                                                r="10"
                                                            ></circle>
                                                            <polyline points="12 6 12 12 16 14"></polyline>
                                                        </svg>
                                                        <span>
                                                            {intervalMinutes}м
                                                        </span>
                                                    </div>
                                                </div>
                                                <div
                                                    className={
                                                        styles.chartContainer
                                                    }
                                                >
                                                    <CountryChart
                                                        cityLogs={
                                                            cityLogsForCountry
                                                        }
                                                        cities={cities}
                                                        timeRange={timeRange}
                                                        isChartLoading={
                                                            isChartLoading
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                            {Object.keys(locationGroups).indexOf(interval) <
                                Object.keys(locationGroups).length - 1 && (
                                <hr className={styles.chartDivider} />
                            )}
                        </div>
                    );
                })
            )}
        </div>
    );
};

export default Dashboard;