import express from "express";
import pool from "./db.js";
import { locationGroups } from "./httpCheck.js";

const router = express.Router();

router.get("/http-logs", async (req, res) => {
    try {
        const { timeRange, domain } = req.query;
        let interval;
        switch (timeRange) {
            case "week":
                interval = "7 day";
                break;
            case "day":
                interval = "1 day";
                break;
            case "3hour":
                interval = "3 hour";
                break;
            case "30minutes":
                interval = "30 minute";
                break;
            default:
                interval = "1 hour";
        }

        let query;
        let params;

        if (domain) {
            query = `
        SELECT
          country, city, status_code, created_at, total_time,
          download_time, first_byte_time, dns_time, tls_time, tcp_time
        FROM http_logs
        WHERE created_at >= NOW() - $1::interval AND city IS NOT NULL AND domain = $2
        ORDER BY created_at ASC;
      `;
            params = [interval, domain];
        } else {
            query = `
        SELECT
          domain, country, city, status_code, created_at, total_time,
          download_time, first_byte_time, dns_time, tls_time, tcp_time
        FROM http_logs
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