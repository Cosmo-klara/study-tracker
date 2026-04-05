import React, { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// ================= IndexedDB =================
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

// ================= Utils =================
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

function getColor(hours) {
  if (!hours) return "bg-gray-200";
  if (hours < 1) return "bg-green-200";
  if (hours < 3) return "bg-green-400";
  return "bg-green-600";
}

// 🔥 年度 heatmap（过滤非当年日期）
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

// ================= App =================
export default function App() {
  const [records, setRecords] = useState([]);
  const [config, setConfig] = useState({});

  const [running, setRunning] = useState(false);
  const [startTime, setStartTime] = useState(null);
  const [category, setCategory] = useState("listening");
  const [task, setTask] = useState("");

  const [selectedDate, setSelectedDate] = useState(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const rec = await getAll(STORE_RECORDS);
    const cfgArr = await getAll(STORE_CONFIG);

    const cfg = {};
    cfgArr.forEach((c) => (cfg[c.key] = c.value));

    categories.forEach((c) => {
      if (!cfg[c]) cfg[c] = 336;
    });

    setRecords(rec);
    setConfig(cfg);
  }

  async function addRecord(record) {
    await setItem(STORE_RECORDS, record);
    init();
  }

  function start() {
    setRunning(true);
    setStartTime(Date.now());
  }

  async function stop() {
    const end = Date.now();
    const duration = (end - startTime) / 1000;

    await addRecord({
      id: crypto.randomUUID(),
      category,
      task,
      startTime,
      endTime: end,
      duration,
      logicalDate: getLogicalDate(startTime),
    });

    setRunning(false);
    setTask("");
  }

  function calc(cat) {
    const used = records
      .filter((r) => r.category === cat)
      .reduce((s, r) => s + r.duration, 0);

    const total = (config[cat] || 336) * 3600;

    return {
      percent: (used / total) * 100,
      used: used / 3600,
      total: config[cat] || 336,
    };
  }

  // ================= Heatmap Data =================
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
      <h1 className="text-2xl font-bold">Study Tracker Pro</h1>

      {/* Timer */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h2 className="font-semibold">Timer</h2>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <input
            placeholder="Task"
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

      {/* Progress */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {categories.map((c) => {
          const { percent, used, total } = calc(c);
          return (
            <Card key={c}>
              <CardContent className="p-4 space-y-2">
                <div className="font-semibold">{c}</div>
                <div className="w-full bg-gray-200 h-3 rounded">
                  <div
                    className="bg-blue-500 h-3 rounded"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="text-sm">
                  {percent.toFixed(1)}% ({used.toFixed(1)}h / {total}h)
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

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

            <div className="flex gap-1 overflow-x-auto">
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
                        onMouseEnter={() => setTooltip({ dateStr, total, breakdown })}
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

          {/* Tooltip */}
          {tooltip && (
            <div className="mt-3 text-sm border p-2 bg-white shadow w-fit">
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
              {(grouped[selectedDate] || []).map((r) => (
                <div key={r.id} className="border p-2 text-sm">
                  {r.category} | {r.task} | {(r.duration / 60).toFixed(1)} min
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
