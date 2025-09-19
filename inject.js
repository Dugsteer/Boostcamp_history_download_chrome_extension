(function () {
  let enabled = true; // start capturing immediately
  const store = [];
  const log = (...a) => console.log("[BC→CSV]", ...a);

  // -------- capture filters --------
  const want = (u) => {
    try {
      return /boostcamp\.app/i.test(String(u));
    } catch {
      return false;
    }
  };
  const hasKeys = (t) =>
    /"sets"|"records"|"exercises"|"performedAt"|"completedAt"/.test(t);
  const keepText = (t) => {
    if (!t) return false;
    const s = t.trim();
    return s && (s[0] === "{" || s[0] === "[" || hasKeys(s));
  };

  function broadcastCount() {
    try {
      window.postMessage(
        { source: "BC_INJECT_STATUS", count: store.length },
        "*"
      );
    } catch {}
  }
  function push(url, body) {
    try {
      if (!enabled || !body || !keepText(body)) return;
      const sig = url + "|" + body.length;
      store._sigs ||= new Set();
      if (store._sigs.has(sig)) return;
      store._sigs.add(sig);
      store.push({ url, body });
      updateBadge();
      broadcastCount();
    } catch {}
  }

  // -------- badge / download --------
  function updateBadge() {
    const n = store.length;
    let el = document.getElementById("bc-capture-badge");
    if (!el) {
      el = document.createElement("div");
      el.id = "bc-capture-badge";
      Object.assign(el.style, {
        position: "fixed",
        right: "10px",
        bottom: "10px",
        zIndex: 2147483647,
        background: "#0b5",
        color: "#fff",
        padding: "6px 10px",
        borderRadius: "6px",
        font: "13px system-ui",
        boxShadow: "0 2px 6px rgba(0,0,0,.25)",
        cursor: "pointer",
      });
      el.onclick = downloadCSV;
      document.documentElement.appendChild(el);
    }
    el.textContent = `Boostcamp JSON: ${n}`;
    el.style.display = n ? "block" : "none";
  }
  function triggerDownload(name, blob) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function downloadCSV() {
    const rows = parseAllPerSet(store);
    const csv = toCSV(rows);
    triggerDownload(
      "boostcamp_history_per_set.csv",
      new Blob([csv], { type: "text/csv" })
    );
  }

  // -------- utils --------
  const num = (x) => {
    if (x === null || x === undefined || x === "") return undefined;
    const n = typeof x === "string" ? Number(x) : x;
    return Number.isNaN(n) ? undefined : n;
  };
  // date formatters
  function toEU(isoLike) {
    if (!isoLike) return "";
    if (/^\d{13}$/.test(String(isoLike))) {
      const d = new Date(Number(isoLike));
      return isNaN(d)
        ? ""
        : d.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          });
    }
    const d = new Date(isoLike);
    if (!isNaN(d))
      return d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoLike));
    return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : "";
  }
  function toUS(isoLike) {
    if (!isoLike) return "";
    if (/^\d{13}$/.test(String(isoLike))) {
      const d = new Date(Number(isoLike));
      return isNaN(d)
        ? ""
        : d.toLocaleDateString("en-US", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          });
    }
    const d = new Date(isoLike);
    if (!isNaN(d))
      return d.toLocaleDateString("en-US", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoLike));
    return m ? `${m[2]}/${m[3]}/${m[1].slice(2)}` : "";
  }

  // lbs ↔ conversions and rounding
  function roundHalf(x) {
    return Math.round(x * 2) / 2;
  }
  function lbsToKgHalf(lbs) {
    const n = Number(lbs);
    if (!isFinite(n)) return undefined;
    const kg = n / 2.20462262185;
    return roundHalf(kg);
  }
  function cleanLb(lbs) {
    const n = Number(lbs);
    if (!isFinite(n)) return undefined;
    return roundHalf(n); // clean residual .01 from server calc
  }

  // ---- raw lbs from a set (ONLY from archived/previous)
  function getRawLbs(s) {
    if (!s) return undefined;
    const aw = s.archived_weight ?? s.archivedWeight;
    if (aw != null && aw !== "") return num(aw);
    const pw = s.previous_weight ?? s.previousWeight;
    if (pw != null && pw !== "") return num(pw);
    return undefined;
  }
  // reps (archived first)
  function getReps(s) {
    if (!s) return undefined;
    const ar = num(s.archived_reps);
    if (ar !== undefined) return ar;
    const am = num(s.amount);
    if (am !== undefined) return am;
    const rp = num(s.reps);
    if (rp !== undefined) return rp;
    const rp2 = num(s.rep);
    if (rp2 !== undefined) return rp2;
    const ct = num(s.count);
    if (ct !== undefined) return ct;
    return undefined;
  }

  // ---- program/workout pickers ----
  function isWorkoutNode(o) {
    return (
      !!o &&
      typeof o === "object" &&
      (Array.isArray(o.records) || "program_id" in o || "programId" in o)
    );
  }
  function pickProgram(o, prevProgram) {
    if (isWorkoutNode(o) && typeof o.name === "string" && o.name.trim()) {
      return o.name.trim(); // e.g., "Bullmastiff", "SBD Double Top"
    }
    if (o?.program && (o.program.name || o.program.title))
      return o.program.name || o.program.title;
    if (o?.block && (o.block.name || o.block.title))
      return o.block.name || o.block.title;
    return prevProgram || "";
  }
  function pickWorkoutTitle(o, prevWorkout) {
    if (typeof o.workoutTitle === "string" && o.workoutTitle.trim())
      return o.workoutTitle.trim();
    if (typeof o.title === "string") {
      const t = o.title.trim();
      if (/Week\s*\d+|Day\s*\d+/i.test(t)) return t;
    }
    return prevWorkout || "";
  }

  // ---- find sets property on an object ----
  const getSets = (o) => {
    if (!o || typeof o !== "object") return null;
    for (const k of [
      "sets",
      "completed_sets",
      "set_list",
      "performedSets",
      "performed_sets",
    ]) {
      if (Array.isArray(o[k]) && o[k].length) return o[k];
    }
    return null;
  };

  // ---- detect unit per WORKOUT: 'kg' or 'lb'
  function collectRawLbs(node, bag) {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const it of node) collectRawLbs(it, bag);
      return;
    }
    if (typeof node !== "object") return;
    const sets = getSets(node);
    if (sets) {
      for (const s of sets) {
        const w = getRawLbs(s);
        if (w !== undefined) bag.push(w);
      }
    }
    for (const [k, v] of Object.entries(node)) {
      if (k === "alternatives") continue; // ignore phantom alternatives
      if (Array.isArray(v) || (v && typeof v === "object"))
        collectRawLbs(v, bag);
    }
  }
  function detectUnitFromRawLbs(weights) {
    if (!weights.length) return "kg"; // default
    let hitsHalfOrZero = 0;
    for (const w of weights) {
      const frac = Math.abs(w % 1);
      const near0 =
        Math.abs(frac - 0.0) <= 0.02 || Math.abs(frac - 1.0) <= 0.02;
      const near05 = Math.abs(frac - 0.5) <= 0.02;
      if (near0 || near05) hitsHalfOrZero++;
    }
    const ratio = hitsHalfOrZero / weights.length;
    return ratio >= 0.7 ? "lb" : "kg";
  }

  // -------- main parser (per-set rows), skipping "alternatives" --------
  function parseAllPerSet(items) {
    const out = [];

    function walk(node, ctx) {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const it of node) walk(it, ctx);
        return;
      }
      if (typeof node !== "object") return;

      const next = { ...ctx };

      // when we hit a WORKOUT node, decide unit mode for this workout
      if (isWorkoutNode(node) && !next.unitMode) {
        const bag = [];
        collectRawLbs(node, bag);
        next.unitMode = detectUnitFromRawLbs(bag); // 'kg' or 'lb'
      }

      // program/workout context
      next.program = pickProgram(node, next.program);
      const workoutTitle = pickWorkoutTitle(node, next.workout);
      if (workoutTitle) {
        next.workout = workoutTitle;
        next.week = workoutTitle.match(/Week\s*\d+/i)?.[0] || next.week;
        next.day = workoutTitle.match(/Day\s*\d+/i)?.[0] || next.day;
      }

      // date context
      const rawDate =
        node.date || node.performedAt || node.completedAt || next.date || "";
      if (rawDate) next.date = rawDate;

      // exercise-level sets
      const sets = getSets(node);
      if (sets) {
        const exercise =
          node.name || node.exercise || node.movement || node.title || "";
        const dateOut =
          next.unitMode === "lb" ? toUS(next.date) : toEU(next.date);

        for (let i = 0; i < sets.length; i++) {
          const s = sets[i] || {};
          const rawLbs = getRawLbs(s);
          if (rawLbs === undefined) continue; // only completed sets

          const reps = getReps(s);
          const weightOut =
            next.unitMode === "lb" ? cleanLb(rawLbs) : lbsToKgHalf(rawLbs);
          const unitOut = next.unitMode === "lb" ? "lb" : "kg";

          out.push({
            workout: next.program || "", // program/workout name (e.g., Bullmastiff)
            date: dateOut,
            week: next.week || "",
            day: next.day || "",
            exercise,
            set: i + 1, // set index 1..n
            weight: weightOut ?? "",
            unit: unitOut,
            reps: reps ?? "",
          });
        }
      }

      // descend, but never into "alternatives"
      for (const [k, v] of Object.entries(node)) {
        if (k === "alternatives") continue;
        if (Array.isArray(v) || (v && typeof v === "object")) walk(v, next);
      }
    }

    for (const it of items) {
      let obj;
      try {
        obj = JSON.parse(it.body);
      } catch {
        continue;
      }
      const root = obj?.data || obj?.result || obj;
      if (!root || typeof root !== "object") continue;

      // seed by date-like parent keys if present
      let seeded = false;
      for (const [k, v] of Object.entries(root)) {
        if (
          Array.isArray(v) &&
          (/^\d{4}-\d{2}-\d{2}$/.test(k) || /^\d{13}$/.test(String(k)))
        ) {
          const iso = /^\d{13}$/.test(String(k))
            ? new Date(Number(k)).toISOString().slice(0, 10)
            : k;
          walk(v, {
            program: "",
            workout: "",
            date: iso,
            week: "",
            day: "",
            unitMode: "",
          });
          seeded = true;
        }
      }
      if (!seeded)
        walk(root, {
          program: "",
          workout: "",
          date: "",
          week: "",
          day: "",
          unitMode: "",
        });
    }

    return out;
  }

  function toCSV(rows) {
    const cols = [
      "workout",
      "date",
      "week",
      "day",
      "exercise",
      "set",
      "weight",
      "unit",
      "reps",
    ];
    const esc = (v) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.join(",")];
    for (const r of rows) lines.push(cols.map((c) => esc(r[c])).join(","));
    return rows.length ? lines.join("\n") : cols.join(",");
  }

  // -------- network hooks --------
  const OF = window.fetch;
  window.fetch = async function (...args) {
    const res = await OF.apply(this, args);
    const url = (args[0] && args[0].url) || String(args[0] || res.url || "");
    if (enabled && want(url))
      res
        .clone()
        .text()
        .then((t) => push(url, t))
        .catch(() => {});
    return res;
  };
  const OO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, ...rest) {
    this.addEventListener("load", () => {
      if (enabled && want(u)) push(String(u), this.responseText || "");
    });
    return OO.call(this, m, u, ...rest);
  };

  // -------- popup command --------
  window.addEventListener("message", (ev) => {
    const msg = ev.data;
    if (!msg || msg.source !== "BC_CONTENT") return;
    if (msg.type === "BC_DOWNLOAD_CSV") downloadCSV();
  });

  broadcastCount();
  log(
    "inject ready (per-set CSV; ignore alternatives; auto-detect kg/lb & date format)"
  );
})();
