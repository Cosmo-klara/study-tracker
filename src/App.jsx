import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const DB_NAME = "studyDB";
const STORE_RECORDS = "records";
const STORE_CONFIG = "config";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        db.createObjectStore(STORE_RECORDS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_CONFIG)) {
        db.createObjectStore(STORE_CONFIG, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

async function getAll(store) {
  const db = await openDB();
  const tx = db.transaction(store, "readonly");
  return new Promise((res) => {
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
  });
}

async function setItem(store, item) {
  const db = await openDB();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(item);
}

const categories = ["listening", "reading", "writing", "speaking"];
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getLogicalDate(ts) {
  const d = new Date(ts);
  if (d.getHours() < 6) d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

function getDateStr(d) {
  return d.toISOString().split("T")[0];
}

// 有一说一 Github 那个 heatmap 的颜色设计真不赖吧
function getColor(hours) {
  if (!hours) return "bg-gray-200";
  if (hours < 1) return "bg-green-200";
  if (hours < 3) return "bg-green-400";
  return "bg-green-600";
}

function getMonthKeyFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function formatHumanDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0));

  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h${m}min`;
  }

  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}min${ss}s`;
}

function formatClockHM(ts) {
  if (!ts) return "--:--";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 需要注意的地方：要过滤非当年日期，参考 Github 的那个 heatmap，估计是这样做的
function buildYearWeeks(year) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);

  const weeks = [];
  let current = new Date(start);

  while (current <= end || current.getDay() !== 1) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

export default function App() {
  const [records, setRecords] = useState([]);
  const [config, setConfig] = useState({});

  const [running, setRunning] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lockedCategory, setLockedCategory] = useState(null);
  const [category, setCategory] = useState("listening");
  const [task, setTask] = useState("");

  const [selectedDate, setSelectedDate] = useState(() => getLogicalDate(Date.now()));
  const [year, setYear] = useState(new Date().getFullYear());
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (!running) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  async function init() {
    const rec = await getAll(STORE_RECORDS);
    const cfgArr = await getAll(STORE_CONFIG);

    const cfg = {};
    cfgArr.forEach((c) => (cfg[c.key] = c.value));

    categories.forEach((c) => {
      const key = `dailyHours:${c}`;
      if (cfg[key] == null) cfg[key] = 8;
    });

    setRecords(rec);
    setConfig(cfg);
  }

  async function addRecord(record) {
    await setItem(STORE_RECORDS, record);
    init();
  }

  function start() {
    setLockedCategory(category);
    setRunning(true);
    setStartTime(Date.now());
    setNowMs(Date.now());
  }

  async function stop() {
    const end = Date.now();
    const duration = (end - startTime) / 1000;

    await addRecord({
      id: crypto.randomUUID(),
      category: lockedCategory ?? category,
      task,
      startTime,
      endTime: end,
      duration,
      logicalDate: getLogicalDate(startTime),
    });

    setRunning(false);
    setLockedCategory(null);
    setTask("");
  }

  async function setConfigValue(key, value) {
    setConfig((c) => ({ ...c, [key]: value }));
    await setItem(STORE_CONFIG, { key, value });
  }

  function calc(cat, monthKey, daysInMonth) {
    const usedSeconds = records
      .filter((r) => r.category === cat && r.logicalDate?.slice(0, 7) === monthKey)
      .reduce((s, r) => s + r.duration, 0);

    const dailyKey = `dailyHours:${cat}`;
    const dailyHours = Number(config[dailyKey] ?? 8);
    const totalHours = dailyHours * daysInMonth;
    const totalSeconds = totalHours * 3600;

    return {
      percent: totalSeconds ? (usedSeconds / totalSeconds) * 100 : 0,
      usedHours: usedSeconds / 3600,
      totalHours,
      dailyHours,
      dailyKey,
    };
  }

  const grouped = {};
  records.forEach((r) => {
    if (!grouped[r.logicalDate]) grouped[r.logicalDate] = [];
    grouped[r.logicalDate].push(r);
  });

  const dailyMap = {};
  Object.keys(grouped).forEach((d) => {
    dailyMap[d] = grouped[d].reduce((s, r) => s + r.duration, 0) / 3600;
  });

  const weeks = buildYearWeeks(year);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Progress Bar</h1>


      <div className="flex justify-end">
        <div className="text-sm text-gray-500">
          {(() => {
            const now = new Date();
            const monthKey = getMonthKeyFromDate(now);
            const days = getDaysInMonth(now.getFullYear(), now.getMonth());
            return `${monthKey} (${days} days)`;
          })()}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(() => {
          const now = new Date();
          const monthKey = getMonthKeyFromDate(now);
          const daysInMonth = getDaysInMonth(now.getFullYear(), now.getMonth());

          return categories.map((c) => {
            const { percent, usedHours, totalHours, dailyHours, dailyKey } = calc(
              c,
              monthKey,
              daysInMonth,
            );

            return (
              <Card key={c}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{c}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span>h/day</span>
                      <input
                        value={Number.isFinite(dailyHours) ? dailyHours : 8}
                        onChange={(e) => {
                          const v = e.target.value;
                          const n = v === "" ? "" : Number(v);
                          setConfig((cfg) => ({ ...cfg, [dailyKey]: n }));
                        }}
                        onBlur={(e) => {
                          const n = Number(e.target.value);
                          setConfigValue(dailyKey, Number.isFinite(n) ? n : 8);
                        }}
                        className="w-16 border rounded px-2 py-1 text-right"
                        inputMode="decimal"
                      />
                    </div>
                  </div>

                  <div className="w-full bg-gray-200 h-3 rounded">
                    <div
                      className="bg-blue-500 h-3 rounded"
                      style={{ width: `${Math.min(100, percent)}%` }}
                    />
                  </div>

                  <div className="text-sm">
                    {percent.toFixed(1)}% ({usedHours.toFixed(1)}h / {totalHours.toFixed(0)}h)
                  </div>
                </CardContent>
              </Card>
            );
          });
        })()}
      </div>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">Timer</h2>
            <div className="font-mono text-sm text-gray-600">
              {formatDuration(running && startTime ? (nowMs - startTime) / 1000 : 0)}
            </div>
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={running}
            className="border px-2 py-1 rounded disabled:opacity-60"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            placeholder="Task Content"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            className="border px-2 py-1"
          />
          {!running ? (
            <Button onClick={start}>Start</Button>
          ) : (
            <Button onClick={stop}>Stop</Button>
          )}
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardContent className="p-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="font-semibold">Learning Heatmap</h2>
            <div className="space-x-2">
              <Button onClick={() => setYear((y) => y - 1)}>◀</Button>
              <span>{year}</span>
              <Button onClick={() => setYear((y) => y + 1)}>▶</Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <div className="w-fit mx-auto">
              {/* Month labels */}
              <div className="flex ml-10 mb-1 text-xs text-gray-500">
                {weeks.map((week, i) => {
                  const firstDay = week[0];
                  const show = firstDay.getDate() <= 7;
                  return (
                    <div key={i} className="w-4 mr-1">
                      {show ? firstDay.toLocaleString("default", { month: "short" }) : ""}
                    </div>
                  );
                })}
              </div>

              <div className="flex">
                <div className="flex flex-col justify-between text-xs mr-2 text-gray-500">
                  {weekDays.map((d) => (
                    <div key={d} className="h-4">{d}</div>
                  ))}
                </div>

                <div className="flex gap-1">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="flex flex-col gap-1">
                      {week.map((day, di) => {
                        const dateStr = getDateStr(day);
                        const isCurrentYear = day.getFullYear() === year;

                    if (!isCurrentYear) {
                      return <div key={di} className="w-4 h-4 bg-transparent" />;
                    }

                    const recordsOfDay = grouped[dateStr] || [];
                    const total = recordsOfDay.reduce((s, r) => s + r.duration, 0) / 3600;

                    const breakdown = {};
                    categories.forEach((c) => (breakdown[c] = 0));
                    recordsOfDay.forEach((r) => {
                      breakdown[r.category] += r.duration / 3600;
                    });

                    return (
                      <div
                        key={di}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setTooltip({
                            dateStr,
                            total,
                            breakdown,
                            x: rect.left + rect.width / 2,
                            y: rect.top + rect.height,
                          });
                        }}
                        onMouseMove={(e) => {
                          setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : t));
                        }}
                        onMouseLeave={() => setTooltip(null)}
                        onClick={() => setSelectedDate(dateStr)}
                        className={`w-4 h-4 cursor-pointer ${getColor(total)}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
            </div>
          </div>

          {tooltip && (
            <div
              className="fixed z-50 text-sm border p-2 bg-white shadow w-fit pointer-events-none"
              style={{
                left: tooltip.x,
                top: tooltip.y,
                transform: "translate(12px, 12px)",
              }}
            >
              <div className="font-medium">{tooltip.dateStr}</div>
              <div>Total: {tooltip.total.toFixed(2)}h</div>
              {categories.map((c) => (
                <div key={c}>
                  {c}: {tooltip.breakdown[c].toFixed(2)}h
                </div>
              ))}
            </div>
          )}

          {selectedDate && (
            <div className="mt-4 space-y-2">
              <h3 className="font-medium">{selectedDate}</h3>
              {(grouped[selectedDate] || [])
                .slice()
                .sort((a, b) => (b.startTime || 0) - (a.startTime || 0))
                .map((r) => (
                  <div key={r.id} className="border p-2 text-sm space-y-1 text-left">
                    <div className="font-medium">
                      {formatClockHM(r.startTime)} {r.category}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate">{r.task || ""}</div>
                      <div className="shrink-0 text-gray-500">
                        {formatHumanDuration(r.duration)}
                      </div>
                    </div>
                  </div>
                ))}
              {!grouped[selectedDate] && (
                <div className="text-sm text-gray-500">No study records</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
