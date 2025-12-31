import { Line } from "react-chartjs-2";
import { useRef, useEffect, useState } from "react";
import styles from "./CountryChart.module.scss";
import {
    Chart as ChartJS,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    TimeScale,
    TimeSeriesScale,
} from "chart.js";
import "chartjs-adapter-date-fns";
import { ru } from "date-fns/locale";
import CrosshairPlugin from "chartjs-plugin-crosshair";
import { cityTranslations } from "../../data/constants.ts";

ChartJS.register(
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    CrosshairPlugin,
    TimeScale,
    TimeSeriesScale
);
interface Log {
    rtt_avg?: number;
    created_at: string;
    packet_loss?: number;
    total_time?: number;
    status_code?: number;
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

interface CountryChartProps {
    cityLogs: CityLogs;
    cities: string[];
    timeRange: string;
    isChartLoading: boolean;
}

const cityColors: { [key: string]: string } = {
    Moscow: "#FF6384",
    "Saint Petersburg": "#36A2EB",
    Kyiv: "#FFCE56",
    Lviv: "#4BC0C0",
    Almaty: "#9966FF",
    Astana: "#FF9F40",
    Minsk: "#E7E9ED",
    Berlin: "#ffcd56",
    Dusseldorf: "#ff9f40",
    Bishkek: "#4bc0c0",
    Warsaw: "#9966ff",
    Krakow: "#c9cbcf",
    Riga: "#ff6384",
    Vilnius: "#ffcd56",
    Siauliai: "#ff9f40",
    Tallinn: "#4bc0c0",
    "New York": "#9966ff",
    "Los Angeles": "#c9cbcf",
    Amsterdam: "#ff6384",
    Utrecht: "#ffcd56",
    London: "#ff9f40",
    Woking: "#4bc0c0",
    Chisinau: "#9966ff",
    Prague: "#c9cbcf",
    Brno: "#ff6384",
    Tbilisi: "#ffcd56",
    Yerevan: "#ff9f40",
};

const CountryChart = ({
    cityLogs,
    cities,
    timeRange,
    isChartLoading,
}: CountryChartProps) => {
    const [width, setWidth] = useState(window.innerWidth);

    useEffect(() => {
        const handleResize = () => setWidth(window.innerWidth);
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);
    type ChartData = {
        x: number;
        y: number | null;
        packet_loss: number;
        status_code: number | undefined;
        dns_time: number | undefined;
        tcp_time: number | undefined;
        tls_time: number | undefined;
        first_byte_time: number | undefined;
        download_time: number | undefined;
        unreliable: boolean | undefined;
    };

    const chartRef = useRef<ChartJS<"line", ChartData[]>>(null);

    useEffect(() => {
        const chart = chartRef.current;
        if (chart) {
            if (isChartLoading) {
                chart.canvas.classList.add(styles.chartLoading);
            } else {
                chart.canvas.classList.remove(styles.chartLoading);
            }
        }
    }, [isChartLoading]);
    useEffect(() => {
        return () => {
            const tooltipEl = document.getElementById("chartjs-tooltip");
            if (tooltipEl) {
                tooltipEl.remove();
            }
        };
    }, []);

    const datasets = cities.map((city) => {
        const logs = cityLogs[city] || [];
        const color = cityColors[city] || "#c9cbcf";

        // Данные приходят с сервера уже агрегированными или детальными
        const data = logs.map((log: Log) => ({
            x: new Date(log.created_at).getTime(),
            y: log.total_time || null,
            packet_loss: log.packet_loss,
            status_code: log.status_code,
            dns_time: log.dns_time,
            tcp_time: log.tcp_time,
            tls_time: log.tls_time,
            first_byte_time: log.first_byte_time,
            download_time: log.download_time,
            unreliable: log.unreliable,
        }));

        return {
            label: cityTranslations[city] || city,
            data: data,
            borderColor: color,
            backgroundColor: `${color}33`,
            pointBackgroundColor: color,
            pointRadius: (context: any) => {
                const log = context.raw;
                return log.unreliable ? 5 : 0;
            },
            pointBorderColor: (context: any) => {
                const log = context.raw;
                return log.unreliable ? "red" : color;
            },
            pointHoverRadius: 7,
            pointHitRadius: 20,
            tension: 0.2,
            fill: true,
            spanGaps: false,
        };
    });

    // Клиентская сортировка удалена
    const chartData = {
        datasets: datasets,
    };

    const getOptions = (timeRange: string, width: number) => {
        const timeSettings: {
            [key: string]: {
                unit: "day" | "hour" | "minute";
                stepSize?: number;
                displayFormats: { [key: string]: string };
                maxTicksLimit: number;
            };
        } = {
            month: {
                unit: "day",
                stepSize: 7,
                displayFormats: {
                    day: "dd.MM",
                },
                maxTicksLimit: 8,
            },
            week: {
                unit: "day",
                displayFormats: {
                    day: "dd.MM",
                },
                maxTicksLimit: 7,
            },
            day: {
                unit: "hour",
                stepSize: 4,
                displayFormats: {
                    hour: "HH:mm",
                },
                maxTicksLimit: 6,
            },
            hour: {
                unit: "minute",
                stepSize: 10,
                displayFormats: {
                    minute: "HH:mm",
                },
                maxTicksLimit: 6,
            },
        };

        const currentTimeSettings = timeSettings[timeRange] || timeSettings["3hour"];

        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom" as const,
                    labels: {
                        color: "#d4d4d4",
                        usePointStyle: true,
                        pointStyle: "circle",
                    },
                },
                title: {
                    display: false,
                },
                tooltip: {
                    enabled: false,
                    external: function (context: any) {
                        let tooltipEl =
                            document.getElementById("chartjs-tooltip");

                        if (!tooltipEl) {
                            tooltipEl = document.createElement("div");
                            tooltipEl.id = "chartjs-tooltip";
                            tooltipEl.innerHTML = "<table></table>";
                            document.body.appendChild(tooltipEl);
                        }

                        const tooltipModel = context.tooltip;
                        if (tooltipModel.opacity === 0) {
                            tooltipEl.style.opacity = "0";
                            return;
                        }

                        tooltipEl.classList.remove(
                            "above",
                            "below",
                            "no-transform"
                        );
                        if (tooltipModel.yAlign) {
                            tooltipEl.classList.add(tooltipModel.yAlign);
                        } else {
                            tooltipEl.classList.add("no-transform");
                        }

                        function getBody(bodyItem: any) {
                            return bodyItem.lines;
                        }

                        if (tooltipModel.body) {
                            const bodyLines = tooltipModel.body.map(getBody);

                            let innerHtml = "<thead>";

                            if (tooltipModel.dataPoints.length > 0) {
                                const firstPoint = tooltipModel.dataPoints[0];
                                if (firstPoint && firstPoint.parsed) {
                                    const formattedDate = new Date(
                                        firstPoint.parsed.x
                                    ).toLocaleDateString("ru-RU", {
                                        weekday: "long",
                                        day: "numeric",
                                        month: "long",
                                    });
                                    const formattedTime = new Date(
                                        firstPoint.parsed.x
                                    ).toLocaleTimeString("ru-RU", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    });
                                    innerHtml +=
                                        "<tr><th>" +
                                        formattedDate +
                                        " в " +
                                        formattedTime +
                                        "</th></tr>";
                                }
                            }
                            innerHtml += "</thead><tbody>";

                            bodyLines.forEach(function (body: any, i: any) {
                                const colors = tooltipModel.labelColors[i];
                                let style = "background:" + colors.borderColor;
                                style += "; border-color:" + colors.borderColor;
                                style += "; border-width: 2px";
                                style += "; margin-right: 5px";
                                style += "; height: 10px";
                                style += "; width: 10px";
                                style += "; display: inline-block";
                                style += "; border-radius: 50%";
                                const span =
                                    '<span style="' + style + '"></span>';
                                innerHtml +=
                                    "<tr><td>" + span + body + "</td></tr>";
                            });
                            innerHtml += "</tbody>";

                            let table = tooltipEl.querySelector("table");
                            if (table) {
                                table.innerHTML = innerHtml;
                            }
                        }

                        const chart = context.chart;
                        const position = chart.canvas.getBoundingClientRect();

                        tooltipEl.style.opacity = "1";
                        tooltipEl.style.position = "absolute";
                        tooltipEl.style.fontFamily =
                            tooltipModel.options.bodyFont.family;
                        tooltipEl.style.fontSize =
                            tooltipModel.options.bodyFont.size + "px";
                        tooltipEl.style.fontStyle =
                            tooltipModel.options.bodyFont.style;
                        tooltipEl.style.padding =
                            tooltipModel.padding +
                            "px " +
                            tooltipModel.padding +
                            "px";
                        tooltipEl.style.pointerEvents = "none";
                        tooltipEl.style.backgroundColor = "rgba(36, 36, 36, 1)";
                        tooltipEl.style.borderRadius = "5px";
                        tooltipEl.style.color = "white";
                        tooltipEl.style.maxWidth = "500px";
                        tooltipEl.style.whiteSpace = "normal";
                        tooltipEl.style.wordWrap = "break-word";
                        tooltipEl.style.padding = "5px";
                        tooltipEl.style.zIndex = "9999";

                        if (width <= 500) {
                            tooltipEl.style.width = position.width + "px";
                            tooltipEl.style.left = position.left + "px";
                            tooltipEl.style.top =
                                position.top + window.pageYOffset + 225 + "px";
                        } else {
                            let left =
                                position.left +
                                window.pageXOffset +
                                tooltipModel.caretX;
                            let top = position.top + window.pageYOffset + 225;

                            left -= tooltipEl.offsetWidth / 2;

                            if (left < position.left + window.pageXOffset) {
                                left = position.left + window.pageXOffset;
                            }

                            if (
                                left + tooltipEl.offsetWidth >
                                position.right + window.pageXOffset
                            ) {
                                left =
                                    position.right +
                                    window.pageXOffset -
                                    tooltipEl.offsetWidth;
                            }
                            tooltipEl.style.left = left + "px";
                            tooltipEl.style.top = top + "px";
                        }
                    },
                    titleFont: {
                        size: 16,
                    },
                    bodyFont: {
                        size: 14,
                    },
                    callbacks: {
                        label: function (context: any) {
                            const city = context.dataset.label;
                            const log = context.raw;

                            if (!log) return "";

                            const tooltipLines = [
                                city,
                                `Общее время: ${
                                    context.parsed.y !== null
                                        ? context.parsed.y.toFixed(0)
                                        : "N/A"
                                }мс`,
                                ...(log.unreliable
                                    ? ["Недостоверный запрос"]
                                    : []),
                                `Статус: ${log.status_code}`,
                                `DNS: ${log.dns_time}мс`,
                                `TCP: ${log.tcp_time}мс`,
                                `TLS: ${log.tls_time}мс`,
                                `Первый байт: ${log.first_byte_time}мс`,
                                `Загрузка: ${log.download_time}мс`,
                            ];
                            return tooltipLines.join(" | ");
                        },
                    },
                },
                crosshair: {
                    enabled: true,
                    line: {
                        color: "#818181ff",
                        width: 2,
                        dashPattern: [6, 6],
                    },
                    snap: {
                        enabled: true,
                    },
                    sync: {
                        enabled: false,
                    },
                    zoom: {
                        enabled: false,
                    },
                },
            },
            interaction: {
                mode: "index" as const,
                intersect: false,
            },
            scales: {
                y: {
                    display: width > 500,
                    beginAtZero: true,
                    grid: {
                        color: "rgba(255, 255, 255, 0.1)",
                    },
                    ticks: {
                        color: "#d4d4d4",
                        maxTicksLimit: 5,
                    },
                },
                x: {
                    type: "time" as const,
                    time: {
                        unit: currentTimeSettings.unit,
                        stepSize: currentTimeSettings.stepSize,
                        displayFormats: currentTimeSettings.displayFormats,
                        tooltipFormat: "PPP p",
                    },
                    adapters: {
                        date: {
                            locale: ru,
                        },
                    },
                    grid: {
                        color: "rgba(255, 255, 255, 0.1)",
                    },
                    ticks: {
                        color: "#d4d4d4",
                        maxTicksLimit: currentTimeSettings.maxTicksLimit,
                    },
                },
            },
        };
    };

    return (
        <Line
            ref={chartRef}
            options={getOptions(timeRange, width)}
            data={chartData}
            className={styles.chart}
        />
    );
};

export default CountryChart;