import dotenv from "dotenv";
dotenv.config();
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export const createHttpTable = async () => {
    try {
        const httpLogsQuery = `
    CREATE TABLE IF NOT EXISTS http_logs (
      id SERIAL PRIMARY KEY,
      probe_id VARCHAR(255),
      domain VARCHAR(255),
      country VARCHAR(2),
      city VARCHAR(255),
      asn INT,
      network VARCHAR(255),
      status_code INT,
      total_time FLOAT,
      download_time FLOAT,
      first_byte_time FLOAT,
      dns_time FLOAT,
      tls_time FLOAT,
      tcp_time FLOAT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
        await pool.query(httpLogsQuery);
        console.log('Table "http_logs" created or already exists.');

        const hourlyLogsQuery = `
    CREATE TABLE IF NOT EXISTS http_hourly_logs (
      id SERIAL PRIMARY KEY,
      domain VARCHAR(255),
      country VARCHAR(2),
      city VARCHAR(255),
      status_code INT,
      total_time FLOAT,
      download_time FLOAT,
      first_byte_time FLOAT,
      dns_time FLOAT,
      tls_time FLOAT,
      tcp_time FLOAT,
      created_at TIMESTAMP
    );
  `;
        await pool.query(hourlyLogsQuery);
        console.log('Table "http_hourly_logs" created or already exists.');

    } catch (err) {
        console.error("Error creating table", err);
    }
};

export default pool;