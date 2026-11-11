(function () {
  "use strict";
  const D = FestivalDomain,
    KEY = "campus-festival-v1";
  const $ = (s) => document.querySelector(s),
    esc = (s) =>
      String(s ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  let state,
    storageWarning = "",
    filterText = "",
    filterScope = "name",
    filterStatus = "",
    sortKey = "id",
    editing = null,
    toastTimer;
  try {
    const saved = localStorage.getItem(KEY);
    state = saved ? JSON.parse(saved) : structuredClone(FestivalSeed);
    if (!Array.isArray(state.groups) || !Array.isArray(state.applications))
      throw Error("形式");
  } catch (e) {
    state = structuredClone(FestivalSeed);
    storageWarning =
      "保存済みデータを読み込めなかったため、初期データを表示しています。必要ならバックアップから復元してください。";
  }
  function ensureApplicationPeriod(data) {
    if (!data.applicationPeriod)
      data.applicationPeriod = structuredClone(FestivalSeed.applicationPeriod);
    if (!Array.isArray(data.lostItems)) data.lostItems = [];
    if (Array.isArray(data.equipment))
      data.equipment.forEach((item) => {
        item.unavailableCount = Number(item.unavailableCount || 0);
        if (!Array.isArray(item.conditionHistory)) item.conditionHistory = [];
      });
  }
  ensureApplicationPeriod(state);
  const labels = {
    draft: "下書き",
    submitted: "承認待ち",
    approved: "承認済み",
    rejected: "差し戻し",
    cancelled: "取消",
    active: "対応中",
    reserved: "予約",
    returned: "返却済み",
    held: "保管中",
    todo: "未着手",
    done: "完了",
  };
  const pages = {
    dashboard: ["◈", "ダッシュボード", "OVERVIEW"],
    groups: ["◎", "団体・メンバー", "ORGANIZATIONS"],
    applications: ["▤", "出店申請", "APPLICATIONS"],
    reservations: ["▦", "会場予約", "VENUES"],
    loans: ["▣", "備品・貸出", "EQUIPMENT"],
    equipment: ["⚒", "備品台帳", "INVENTORY"],
    expenses: ["¥", "予算・経費", "FINANCE"],
    shifts: ["◷", "スタッフ配置", "STAFF"],
    lostItems: ["⌕", "落とし物", "LOST & FOUND"],
    tasks: ["☑", "タスク", "TASKS"],
    notices: ["◉", "お知らせ", "NOTICES"],
    settings: ["⚙", "データ管理", "SETTINGS"],
  };
  const fields = {
    groups: [
      ["name", "団体名", "text"],
      ["representative", "代表者", "text"],
      ["members", "所属人数", "number"],
      ["budget", "予算（円）", "number"],
    ],
    applications: [
      ["title", "企画名", "text"],
      ["groupId", "申請団体", "group"],
      ["venueId", "希望会場", "venue"],
      ["date", "開催日", "date"],
      ["start", "開始時刻", "time"],
      ["end", "終了時刻", "time"],
      ["attendees", "参加予定人数", "number"],
      ["status", "状態", "applicationStatus"],
      ["note", "補足", "textarea"],
    ],
    reservations: [
      ["applicationId", "関連する出店申請", "application"],
      ["groupId", "利用団体", "group"],
      ["venueId", "会場", "venue"],
      ["date", "利用日", "date"],
      ["start", "開始時刻", "time"],
      ["end", "終了時刻", "time"],
      ["attendees", "参加予定人数", "number"],
      ["status", "状態", "reservationStatus"],
    ],
    loans: [
      ["equipmentId", "備品", "equipment"],
      ["groupId", "利用団体", "group"],
      ["applicationId", "関連する出店申請", "application"],
      ["quantity", "数量", "number"],
      ["due", "返却期限", "date"],
      ["status", "状態", "loanStatus"],
    ],
    equipment: [
      ["name", "備品名", "text"],
      ["stock", "総数", "number"],
    ],
    expenses: [
      ["title", "経費名", "text"],
      ["groupId", "団体", "group"],
      ["category", "分類", "category"],
      ["amount", "金額（円）", "number"],
      ["date", "発生日", "date"],
      ["status", "状態", "expenseStatus"],
    ],
    shifts: [
      ["name", "スタッフ名", "text"],
      ["groupId", "所属団体", "group"],
      ["date", "担当日", "date"],
      ["start", "開始時刻", "time"],
      ["end", "終了時刻", "time"],
      ["location", "担当場所", "text"],
    ],
    lostItems: [
      ["item", "落とし物", "text"],
      ["foundDate", "届出日", "date"],
    ],
    tasks: [
      ["title", "タスク名", "text"],
      ["groupId", "団体", "group"],
      ["owner", "担当者", "text"],
      ["due", "期限", "date"],
      ["status", "状態", "taskStatus"],
      ["note", "補足", "textarea"],
    ],
    notices: [
      ["title", "件名", "text"],
      ["groupId", "対象団体", "audience"],
      ["date", "掲載日", "date"],
      ["body", "本文", "textarea"],
    ],
  };
  const prefixes = {
    groups: "G",
    applications: "A",
    reservations: "R",
    loans: "L",
    equipment: "E",
    expenses: "X",
    shifts: "S",
    lostItems: "F",
    tasks: "T",
    notices: "N",
  };
  const personSearchFields = {
    groups: ["representative", "代表者名"],
    shifts: ["name", "スタッフ氏名"],
    tasks: ["owner", "担当者名"],
  };
  function page() {
    return location.hash.slice(1).split("?")[0] || "dashboard";
  }
  function today() {
    return new Date().toLocaleDateString("sv-SE");
  }
  function money(n) {
    return "¥" + Number(n).toLocaleString("ja-JP");
  }
  function name(collection, id) {
    return state[collection].find((r) => r.id === id)?.name || "未設定";
  }
  function badge(v) {
    return `<span class="badge ${esc(v)}">${esc(labels[v] || v)}</span>`;
  }
  function toast(msg) {
    $("#toast").textContent = msg;
    $("#toast").style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("#toast").style.display = "none"), 4000);
  }
  function save(message) {
    state.activity.unshift({ at: new Date().toISOString(), message });
    state.activity = state.activity.slice(0, 100);
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      toast("保存できませんでした。データ管理からバックアップしてください。");
      return;
    }
    if (message) toast(message);
  }
  function download(filename, text, type = "application/json") {
    const blob = new Blob(["\ufeff", text], { type: type + ";charset=utf-8" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function head(title, sub, action = "") {
    return `<div class="page-head"><div><div class="eyebrow">CAMPUS FESTIVAL / ${pages[page()]?.[2] || "WORKSPACE"}</div><h1>${title}</h1><p class="subtitle">${sub}</p></div>${action}</div>`;
  }
  function stat(label, value, hint) {
    return `<div class="stat"><small>${label}</small><strong class="mono">${value}</strong><div class="hint">${hint}</div></div>`;
  }
  function panel(title, body, link = "") {
    return `<div class="panel"><div class="panel-title"><h2>${title}</h2>${link}</div><div class="panel-body">${body}</div></div>`;
  }
  function renderDashboard() {
    const rate = D.completion(state),
      finance = D.budgetSummary(state),
      heldLostItems = (state.lostItems || []).filter(
        (item) => item.status !== "returned",
      );
    return (
      head(
        "運営の今を、ひと目で。",
        "申請から当日の配置まで、チームの動きをここに。",
      ) +
      `<div class="hero"><div><div class="eyebrow">NOVEMBER 14 — 15, 2026</div><h2>つながるアイデア、広がるキャンパス。</h2><p>学園祭の準備状況を確認して、今日の一歩を進めましょう。</p></div><div class="hero-mark">26 / F</div></div>` +
      `<div class="stats">${stat("出店申請", state.applications.length + "<small> 件</small>", "承認待ち " + D.pending(state) + " 件")}${stat("参加団体", state.groups.length + "<small> 団体</small>", "所属メンバー " + D.groupMembers(state) + " 名")}${stat("承認済み経費", money(finance.expenses), "総予算 " + money(finance.budget))}${stat("タスク完了率", rate + "<small> %</small>", "期限超過 " + D.overdueTasks(state, today()).length + " 件")}</div>` +
      `<div class="grid2">${panel(
        "承認待ちの出店申請",
        state.applications
          .filter((a) => a.status === "submitted")
          .map(
            (a) =>
              `<div class="notice-row"><small>${esc(name("groups", a.groupId))} / ${esc(a.date)}</small><b>${esc(a.title)}</b>${badge(a.status)}</div>`,
          )
          .join("") || "<p>承認待ちの申請はありません。</p>",
        '<a href="#applications">申請一覧 →</a>',
      )}${panel(
        "運営からのお知らせ",
        D.notices(state, state.groupId)
          .slice(0, 3)
          .map(
            (n) =>
              `<div class="notice-row"><small>${esc(n.date)} / ${n.groupId === "all" ? "全体" : esc(name("groups", n.groupId))}</small><b>${esc(n.title)}</b><span>${esc(n.body)}</span></div>`,
          )
          .join(""),
        '<a href="#notices">すべて見る →</a>',
      )}</div>` +
      `<div class="grid2">${panel(
        "保管中の落とし物",
        heldLostItems
          .map(
            (item) =>
              `<div class="notice-row"><small>${esc(item.foundDate)}</small><b>${esc(item.item)}</b></div>`,
          )
          .join("") || "<p>現在、保管中の落とし物はありません。</p>",
        '<a href="#lostItems">落とし物を管理 →</a>',
      )}</div>` +
      `<div class="grid2">${panel("団体別の予算残額", state.groups.map((g) => { const summary = D.budgetSummary(state, g.id); return `<div class="metric-line"><span>${esc(g.name)}</span><b>${money(summary.remaining)}</b></div><div class="progress"><span style="width:${summary.remainingRate}%"></span></div>`; }).join(""))}${panel(
        "最近の操作",
        state.activity
          .slice(0, 6)
          .map(
            (a) =>
              `<div class="notice-row"><small>${esc(new Date(a.at).toLocaleString("ja-JP"))}</small><b>${esc(a.message)}</b></div>`,
          )
          .join("") || '<p class="subtitle">まだ操作履歴はありません。</p>',
      )}</div>`
    );
  }
  function columns(p) {
    switch (p) {
      case "groups":
        return [
          ["id", "ID"],
          ["name", "団体名"],
          ["representative", "代表者"],
          ["members", "人数"],
          ["budget", "予算"],
          ["_remaining", "残額"],
        ];
      case "applications":
        return [
          ["id", "ID"],
          ["title", "企画名"],
          ["groupId", "団体"],
          ["venueId", "会場"],
          ["date", "開催日"],
          ["_time", "時間"],
          ["attendees", "人数"],
          ["status", "状態"],
        ];
      case "reservations":
        return [
          ["id", "ID"],
          ["venueId", "会場"],
          ["groupId", "団体"],
          ["date", "利用日"],
          ["_time", "時間"],
          ["attendees", "人数"],
          ["status", "状態"],
        ];
      case "loans":
        return [
          ["id", "ID"],
          ["equipmentId", "備品"],
          ["groupId", "団体"],
          ["quantity", "数量"],
          ["due", "返却期限"],
          ["status", "状態"],
          ["_late", "期限確認"],
        ];
      case "equipment":
        return [
          ["id", "ID"],
          ["name", "備品名"],
          ["stock", "総数"],
          ["_loaned", "貸出中"],
          ["unavailableCount", "使用不可"],
          ["_available", "貸出可能"],
          ["_history", "使用不可・修理履歴"],
        ];
      case "expenses":
        return [
          ["id", "ID"],
          ["title", "経費名"],
          ["groupId", "団体"],
          ["category", "分類"],
          ["amount", "金額"],
          ["date", "発生日"],
          ["status", "状態"],
        ];
      case "shifts":
        return [
          ["id", "ID"],
          ["name", "氏名"],
          ["groupId", "団体"],
          ["date", "担当日"],
          ["_time", "時間"],
          ["location", "担当場所"],
          ["_hours", "時間数"],
        ];
      case "lostItems":
        return [
          ["id", "ID"],
          ["item", "落とし物"],
          ["foundDate", "届出日"],
          ["status", "状態"],
          ["returnedAt", "返却日時"],
        ];
      case "tasks":
        return [
          ["id", "ID"],
          ["title", "タスク"],
          ["groupId", "団体"],
          ["owner", "担当者"],
          ["due", "期限"],
          ["status", "状態"],
        ];
      case "notices":
        return [
          ["id", "ID"],
          ["title", "件名"],
          ["groupId", "対象"],
          ["date", "掲載日"],
          ["body", "本文"],
        ];
    }
  }
  function cell(r, k) {
    if (k === "groupId")
      return r[k] === "all" ? "全体" : esc(name("groups", r[k]));
    if (k === "venueId") return esc(name("venues", r[k]));
    if (k === "equipmentId") return esc(name("equipment", r[k]));
    if (k === "status") return badge(r[k]);
    if (k === "amount" || k === "budget") return money(r[k]);
    if (k === "_remaining") return money(D.remaining(state, r.id));
    if (k === "_time") return esc(r.start) + " – " + esc(r.end);
    if (k === "_hours") return D.shiftHours(r) + " h";
    if (k === "_late")
      return D.loanOverdue(r, today())
        ? '<span class="badge rejected">期限超過</span>'
        : "—";
    if (k === "_loaned") return D.borrowedQuantity(state, r.id);
    if (k === "_available") return D.available(state, r.id);
    if (k === "_history") {
      const history = r.conditionHistory || [];
      return history.length
        ? `<details><summary>${history.length} 件</summary><ul class="condition-history">${history
            .map(
              (entry) =>
                `<li>${entry.action === "restore" ? "修理・復帰" : "使用不可"}: ${esc(entry.quantity)} 個 / ${esc(entry.reason)} / ${esc(entry.date)}</li>`,
            )
            .join("")}</ul></details>`
        : "—";
    }
    if (k === "returnedAt")
      return r[k] ? esc(new Date(r[k]).toLocaleString("ja-JP")) : "—";
    return esc(r[k]);
  }
  function renderList(p) {
    let rows =
      p === "notices"
        ? D.notices(state, state.groupId)
        : p === "lostItems"
          ? state.lostItems || []
          : state[p];
    const personSearchField = personSearchFields[p];
    rows = D.search(
      rows,
      filterText,
      personSearchField && filterScope === "name"
        ? [personSearchField[0]]
        : undefined,
    );
    if (filterStatus) rows = rows.filter((r) => r.status === filterStatus);
    rows =
      p === "tasks" && sortKey === "id"
        ? D.taskOrder(rows)
        : D.sort(rows, sortKey);
    const cols = columns(p),
      statuses = [...new Set(state[p].map((r) => r.status).filter(Boolean))];
    let summary = "";
    if (p === "loans")
      summary = `<div class="stats">${state.equipment.map((e) => stat(esc(e.name), D.available(state, e.id) + "<small> / " + e.stock + "</small>", "貸出可能 / 台帳数")).join("")}</div>`;
    if (p === "equipment")
      summary = `<div class="help">貸出可能数は「総数 − 貸出中 − 使用不可」で計算します。使用不可・修理の変更は理由と日付を履歴に記録します。</div>`;
    if (p === "reservations")
      summary = `<div class="stats">${state.venues.map((v) => stat(esc(v.name), v.capacity + "<small> 名</small>", "予約 " + D.venueUsage(state, v.id) + " 件")).join("")}</div>`;
    if (p === "expenses")
      summary = `<div class="stats">${stat("承認済み経費合計", money(D.budgetSummary(state).expenses), "申請中・差し戻し・取消は含まない")}${stat("総予算", money(D.budgetSummary(state).budget), "団体ごとの予算を合算")}</div>`;
    const exportButton =
      '<button class="secondary" id="export-csv">CSV出力</button>';
    const searchScope =
      personSearchField
        ? `<label class="search-scope">検索対象 <select id="search-scope" aria-label="検索対象"><option value="name" ${filterScope === "name" ? "selected" : ""}>${personSearchField[1]}だけ</option><option value="all" ${filterScope === "all" ? "selected" : ""}>すべての項目</option></select></label>`
        : "";
    const searchLabel =
      personSearchField && filterScope === "name"
        ? `${personSearchField[1]}で検索`
        : "一覧を検索";
    const searchPlaceholder =
      personSearchField && filterScope === "name"
        ? `${personSearchField[1]}で検索`
        : "キーワードで検索";
    return (
      head(
        pages[p][1],
        `${state[p].length}件の登録データ。検索・編集して準備を進めましょう。`,
        `<button id="add-row">＋ 新規登録</button>`,
      ) +
      summary +
      `<div class="toolbar"><div class="filters">${searchScope}<input id="search" type="search" aria-label="${searchLabel}" placeholder="${searchPlaceholder}" value="${esc(filterText)}">${statuses.length ? `<select id="status-filter" aria-label="状態で絞り込み"><option value="">すべての状態</option>${statuses.map((s) => `<option value="${s}" ${filterStatus === s ? "selected" : ""}>${labels[s] || s}</option>`).join("")}</select>` : ""}<select id="sort" aria-label="並び順">${cols
        .filter((c) => !c[0].startsWith("_"))
        .map(
          (c) =>
            `<option value="${c[0]}" ${sortKey === c[0] ? "selected" : ""}>${c[1]}順</option>`,
        )
        .join(
          "",
        )}</select><span class="subtitle">${rows.length} 件表示</span></div>${exportButton}</div>` +
      `<div class="panel"><div class="table-scroll"><table><thead><tr>${cols.map((c) => `<th>${c[1]}</th>`).join("")}<th>操作</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${cols.map((c) => `<td class="${["title", "body", "name", "item"].includes(c[0]) ? "description" : ""}">${cell(r, c[0])}</td>`).join("")}<td><div class="actions"><button class="secondary small" data-edit="${esc(r.id)}">編集</button>${p === "applications" ? `<button class="small" data-approve="${esc(r.id)}">承認</button><button class="danger small" data-cancel="${esc(r.id)}">取消</button>` : ""}${p === "loans" ? `<button class="small" data-return="${esc(r.id)}">返却</button>` : ""}${p === "equipment" ? `<button class="small" data-equipment-condition="${esc(r.id)}" data-action="unavailable" ${D.available(state, r.id) <= 0 ? "disabled" : ""}>使用不可を記録</button>${Number(r.unavailableCount) > 0 ? `<button class="secondary small" data-equipment-condition="${esc(r.id)}" data-action="restore">修理・復帰</button>` : ""}` : ""}${p === "lostItems" && r.status !== "returned" ? `<button class="small" data-return-lost="${esc(r.id)}">返却済みにする</button>` : ""}${p === "tasks" ? `<button class="small" data-done="${esc(r.id)}">完了</button>` : ""}<button class="danger small" data-delete="${esc(r.id)}">削除</button></div></td></tr>`).join("") : `<tr><td colspan="${cols.length + 1}" class="empty">該当するデータはありません。</td></tr>`}</tbody></table></div></div>`
    );
  }
  function renderSettings() {
    return (
      head("データを、手元に。", "保存・復元と、操作する団体を管理します。") +
      `<div class="help">これはブラウザ内で動く演習用システムです。ログイン認証や共同データ保存はありません。役割・団体の切り替えは業務操作の体験用です。同じデータで確認するときはJSONファイルを共有してください。端末やブラウザが変わると保存先も変わります。</div><div class="settings-grid">${panel("バックアップ", '<p>現在の業務データをJSONファイルとして保存します。</p><button id="backup">JSONを書き出す</button>')}${panel("データを復元", '<p>JSONファイルを読み込み、現在のデータを置き換えます。</p><input id="restore-file" aria-label="復元するJSON" type="file" accept=".json"><button id="restore" class="secondary">読み込む</button>')}${panel("操作する団体", `<p>団体代表として表示する団体を選択します。</p><select id="current-group" aria-label="操作する団体">${state.groups.map((g) => `<option value="${g.id}" ${g.id === state.groupId ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>`)}${renderApplicationPeriodSettings()}${panel("サンプルデータへ戻す", '<p>編集内容を破棄して、最初の状態に戻します。実行前にバックアップを保存してください。</p><button id="reset" class="danger">初期データへ戻す</button>')}</div>`
    );
  }
  function renderApplicationPeriodSettings() {
    const period = state.applicationPeriod;
    return `<section class="panel application-period-settings"><div class="panel-title"><h2>申請受付期間</h2></div><div class="panel-body"><p>受付開始・終了を設定します。終了に設定した時刻の分までは提出できます。</p><div class="application-period-fields"><label class="field">開始日時<input id="application-period-start" type="datetime-local" step="60" value="${esc(period.start)}"></label><label class="field">終了日時<input id="application-period-end" type="datetime-local" step="60" value="${esc(period.end)}"></label></div><button id="save-application-period">全体の受付期間を保存</button><h3>団体ごとの延長</h3><p>終了日時より後の日時を設定した団体だけ、個別の期限が適用されます。空欄にして保存すると延長を解除します。</p><div class="application-deadlines">${state.groups
      .map((group) => {
        const deadline = group.applicationDeadline || "";
        const extended =
          deadline && Date.parse(deadline) > Date.parse(period.end);
        const status = extended
          ? `個別延長: ${esc(deadline.replace("T", " "))}${group.applicationDeadlineUpdatedAt ? ` / 変更: ${esc(new Date(group.applicationDeadlineUpdatedAt).toLocaleString("ja-JP"))}` : ""}`
          : "全体の受付終了日時を適用";
        return `<div class="application-deadline"><label for="group-deadline-${esc(group.id)}">${esc(group.name)}</label><div class="application-deadline-controls"><input id="group-deadline-${esc(group.id)}" type="datetime-local" step="60" value="${esc(deadline)}" aria-label="${esc(group.name)}の延長期限"><button type="button" class="secondary small" data-save-group-deadline="${esc(group.id)}">期限を保存</button></div><small>${status}</small></div>`;
      })
      .join("")}</div></div></section>`;
  }
  function render() {
    let p = page();
    if (!pages[p]) {
      location.hash = "dashboard";
      return;
    }
    $("#role").value = state.role;
    $("#nav").innerHTML = Object.entries(pages)
      .map(
        ([k, v]) =>
          `<a href="#${k}" class="${p === k ? "active" : ""}"><span class="nav-icon">${v[0]}</span>${v[1]}</a>`,
      )
      .join("");
    $("#breadcrumb").textContent = "WORKSPACE / " + pages[p][2];
    $("#content").innerHTML =
      (storageWarning ? `<div class="help">${esc(storageWarning)}</div>` : "") +
      (p === "dashboard"
        ? renderDashboard()
        : p === "settings"
          ? renderSettings()
          : renderList(p));
    bind(p);
  }
  function options(type) {
    if (type === "group" || type === "audience")
      return [
        ...(type === "audience" ? [["all", "全体"]] : []),
        ...state.groups.map((g) => [g.id, g.name]),
      ];
    if (type === "venue") return state.venues.map((v) => [v.id, v.name]);
    if (type === "equipment") return state.equipment.map((e) => [e.id, e.name]);
    if (type === "application")
      return [
        ["", "関連なし"],
        ...state.applications.map((a) => [a.id, a.title]),
      ];
    const map = {
      applicationStatus: [
        "draft",
        "submitted",
        "approved",
        "rejected",
        "cancelled",
      ],
      reservationStatus: ["approved", "cancelled"],
      loanStatus: ["reserved", "active", "returned"],
      expenseStatus: ["submitted", "approved", "rejected", "cancelled"],
      taskStatus: ["todo", "active", "done"],
      category: ["備品", "消耗品", "外注", "広報", "その他"],
    };
    return (map[type] || []).map((s) => [s, labels[s] || s]);
  }
  function isGroupLocked(p, row) {
    if (p === "applications") return row.status === "approved";
    if (p === "reservations" && row.applicationId)
      return state.applications.some(
        (application) =>
          application.id === row.applicationId &&
          application.status === "approved",
      );
    return false;
  }
  function openEditor(p, id) {
    const original = id ? state[p].find((r) => r.id === id) : null;
    let row = original ? { ...D.editCopy(original) } : {};
    if (p === "expenses" && original) row = D.expenseForEdit(original);
    editing = { p, id, row, original };
    $("#dialog-title").textContent =
      pages[p][1] + " / " + (id ? "編集" : "新規登録");
    $("#form-fields").innerHTML = fields[p]
      .map(([k, label, type]) => {
        const value =
          row[k] ?? (type === "date" ? today() : type === "number" ? "0" : "");
        const lockedApplicationGroup =
          k === "groupId" && original && isGroupLocked(p, original);
        let input;
        if (type === "textarea")
          input = `<textarea name="${k}">${esc(value)}</textarea>`;
        else if (["text", "number", "date", "time"].includes(type))
          input = `<input name="${k}" type="${type}" ${type === "number" ? 'step="any"' : ""} value="${esc(value)}" ${["title", "name"].includes(k) ? "required" : ""}>`;
        else
          input = `<select name="${k}" ${lockedApplicationGroup ? "disabled" : ""}>${options(type)
            .map(
              ([v, t]) =>
                `<option value="${esc(v)}" ${String(value) === v ? "selected" : ""}>${esc(t)}</option>`,
            )
            .join("")}</select>`;
        return `<div class="field"><label for="field-${k}">${label}</label>${input.replace('name="' + k + '"', 'id="field-' + k + '" name="' + k + '"')}${lockedApplicationGroup ? '<small class="field-hint">承認済みのため、団体は変更できません。</small>' : ""}</div>`;
      })
      .join("");
    $("#editor").showModal();
  }
  function validate(p, r) {
    if (
      !D.validateRequired(
        r,
        fields[p]
          .filter((f) =>
            [
              "title",
              "name",
              "item",
              "groupId",
              "venueId",
              "equipmentId",
              "stock",
              "date",
              "due",
              "start",
              "end",
            ].includes(f[0]),
          )
          .map((f) => f[0]),
      )
    )
      return "必須項目を入力してください";
    if (p === "expenses") return D.validateExpense(r);
    if (p === "groups" && D.duplicateGroup(state, r.name, r.id))
      return "同じ名前の団体が存在します";
    if (["applications", "reservations", "shifts"].includes(p)) {
      const err = D.validateTime(r);
      if (err) return err;
      if (p !== "shifts") {
        const v = state.venues.find((v) => v.id === r.venueId);
        if (v && D.capacityExceeded(r.attendees, v.capacity))
          return "会場の定員を超えています";
        if (p === "reservations" && D.venueConflict(state, r))
          return "会場の予約時間が重複しています";
      }
      if (p === "shifts" && D.shiftConflict(state, r))
        return "スタッフの担当時間が重複しています";
    }
    if (p === "loans") {
      const err = D.validateQuantity(r.quantity);
      if (err) return err;
      const previous = state.loans.find((l) => l.id === r.id);
      const allowance =
        D.available(state, r.equipmentId) +
        (previous &&
        previous.equipmentId === r.equipmentId &&
        previous.status === "active"
          ? Number(previous.quantity)
          : 0);
      if (r.status !== "returned" && r.quantity > allowance)
        return "貸出可能数を超えています";
    }
    if (p === "equipment") {
      if (!Number.isInteger(Number(r.stock)) || Number(r.stock) < 0)
        return "総数は0以上の整数で入力してください";
      const current = state.equipment.find((item) => item.id === r.id);
      if (
        current &&
        Number(r.stock) <
          Number(current.unavailableCount || 0) +
            D.borrowedQuantity(state, r.id)
      )
        return "総数は貸出中と使用不可の合計以上にしてください";
    }
    if (p === "lostItems" && r.status && !["held", "returned"].includes(r.status))
      return "落とし物の状態が不正です";
    return "";
  }
  function bind(p) {
    if (fields[p]) {
      $("#add-row").onclick = () => openEditor(p);
      $("#search").oninput = (e) => {
        const pos = e.target.selectionStart;
        filterText = e.target.value;
        render();
        $("#search").focus();
        $("#search").setSelectionRange(pos, pos);
      };
      if ($("#search-scope"))
        $("#search-scope").onchange = (e) => {
          filterScope = e.target.value;
          render();
        };
      if ($("#status-filter"))
        $("#status-filter").onchange = (e) => {
          filterStatus = e.target.value;
          render();
        };
      $("#sort").onchange = (e) => {
        sortKey = e.target.value;
        render();
      };
      $("#export-csv").onclick = () =>
        download(
          p + ".csv",
          p === "equipment"
            ? D.csv(
                state.equipment.map((item) => ({
                  ...item,
                  borrowedCount: D.borrowedQuantity(state, item.id),
                  availableCount: D.available(state, item.id),
                  conditionHistory: (item.conditionHistory || [])
                    .map(
                      (entry) =>
                        `${entry.date} ${entry.action} ${entry.quantity} ${entry.reason}`,
                    )
                    .join(" / "),
                })),
                [
                  "id",
                  "name",
                  "stock",
                  "borrowedCount",
                  "unavailableCount",
                  "availableCount",
                  "conditionHistory",
                ],
              )
            : D.csv(
                state[p],
                fields[p].map((f) => f[0]),
              ),
          "text/csv",
        );
      document
        .querySelectorAll("[data-edit]")
        .forEach((b) => (b.onclick = () => openEditor(p, b.dataset.edit)));
      document.querySelectorAll("[data-delete]").forEach(
        (b) =>
          (b.onclick = () => {
            if (
              p === "equipment" &&
              (state.loans.some(
                (loan) => loan.equipmentId === b.dataset.delete,
              ) ||
                state.equipment.find((item) => item.id === b.dataset.delete)
                  ?.conditionHistory?.length ||
                Number(
                  state.equipment.find((item) => item.id === b.dataset.delete)
                    ?.unavailableCount,
                ) > 0)
            ) {
              toast("貸出・使用不可の履歴がある備品は削除できません");
              return;
            }
            if (!confirm("このデータを削除しますか？")) return;
            if (p === "groups") D.deleteGroup(state, b.dataset.delete);
            else state[p] = state[p].filter((r) => r.id !== b.dataset.delete);
            save(pages[p][1] + "を削除しました");
            render();
          }),
      );
      document.querySelectorAll("[data-approve]").forEach(
        (b) =>
          (b.onclick = () => {
            if (!D.canApprove(state.role)) {
              toast("実行委員の操作です");
              return;
            }
            const a = state.applications.find(
              (x) => x.id === b.dataset.approve,
            );
            const err = D.validateTime(a);
            if (err) {
              toast(err);
              return;
            }
            if (D.venueConflict(state, a)) {
              toast("会場予約が重複しています");
              return;
            }
            D.approve(state, b.dataset.approve);
            save("出店を承認し、会場を予約しました");
            render();
          }),
      );
      document.querySelectorAll("[data-cancel]").forEach(
        (b) =>
          (b.onclick = () => {
            if (!confirm("出店を取り消しますか？")) return;
            D.cancelApplication(state, b.dataset.cancel);
            save("出店を取り消しました");
            render();
          }),
      );
      document.querySelectorAll("[data-return]").forEach(
        (b) =>
          (b.onclick = () => {
            D.returnLoan(state, b.dataset.return);
            save("返却を記録しました");
            render();
          }),
      );
      document.querySelectorAll("[data-return-lost]").forEach(
        (button) =>
          (button.onclick = () => {
            if (!D.returnLostItem(state, button.dataset.returnLost)) {
              toast("この落とし物はすでに返却済みです");
              return;
            }
            save("落とし物の返却を記録しました");
            render();
          }),
      );
      document.querySelectorAll("[data-equipment-condition]").forEach(
        (button) =>
          (button.onclick = () => {
            const equipment = state.equipment.find(
              (item) => item.id === button.dataset.equipmentCondition,
            );
            $("#equipment-condition-title").textContent =
              equipment.name +
              (button.dataset.action === "restore"
                ? " / 修理・使用可能に戻す"
                : " / 使用不可を記録");
            $("#equipment-condition-action").value = button.dataset.action;
            $("#equipment-condition-id").value = equipment.id;
            $("#equipment-condition-quantity").max =
              button.dataset.action === "restore"
                ? equipment.unavailableCount
                : D.available(state, equipment.id);
            $("#equipment-condition-quantity").value = "";
            $("#equipment-condition-reason").value = "";
            $("#equipment-condition-date").value = today();
            $("#equipment-condition-dialog").showModal();
          }),
      );
      document.querySelectorAll("[data-done]").forEach(
        (b) =>
          (b.onclick = () => {
            state.tasks.find((t) => t.id === b.dataset.done).status = "done";
            save("タスクを完了しました");
            render();
          }),
      );
    }
    if (p === "settings") {
      $("#save-application-period").onclick = () => {
        const start = $("#application-period-start").value;
        const end = $("#application-period-end").value;
        const startTime = Date.parse(start);
        const endTime = Date.parse(end);
        if (
          !start ||
          !end ||
          !Number.isFinite(startTime) ||
          !Number.isFinite(endTime) ||
          startTime > endTime
        ) {
          toast("受付開始・終了日時を正しく設定してください");
          return;
        }
        state.applicationPeriod = { start, end };
        save("申請受付期間を更新しました");
        render();
      };
      document
        .querySelectorAll("[data-save-group-deadline]")
        .forEach((button) => {
          button.onclick = () => {
            const group = state.groups.find(
              (item) => item.id === button.dataset.saveGroupDeadline,
            );
            const deadlineInput = $(
              "#group-deadline-" + button.dataset.saveGroupDeadline,
            );
            const deadline = deadlineInput.value;
            if (deadline) {
              const deadlineTime = Date.parse(deadline);
              const periodEnd = Date.parse(state.applicationPeriod.end);
              if (
                !Number.isFinite(deadlineTime) ||
                !Number.isFinite(periodEnd) ||
                deadlineTime <= periodEnd
              ) {
                toast("団体の延長期限は全体の終了日時より後に設定してください");
                return;
              }
              group.applicationDeadline = deadline;
              group.applicationDeadlineUpdatedAt = new Date().toISOString();
              save(group.name + "の申請期限を延長しました");
            } else {
              if (!group.applicationDeadline) {
                toast("解除する個別延長はありません");
                return;
              }
              delete group.applicationDeadline;
              delete group.applicationDeadlineUpdatedAt;
              save(group.name + "の個別申請期限延長を解除しました");
            }
            render();
          };
        });
      $("#backup").onclick = () =>
        download(
          "festival-backup-" + today() + ".json",
          JSON.stringify(state, null, 2),
        );
      $("#restore").onclick = async () => {
        const file = $("#restore-file").files[0];
        if (!file) {
          toast("ファイルを選んでください");
          return;
        }
        try {
          const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ""));
          if (!D.validateImport(data) || !D.validateUniqueIds(data))
            throw Error("形式が不正です");
          if (!confirm("現在のデータを置き換えますか？")) return;
          state = data;
          ensureApplicationPeriod(state);
          save("バックアップを復元しました");
          render();
        } catch (e) {
          toast("読み込めませんでした：" + e.message);
        }
      };
      $("#reset").onclick = () => {
        if (!confirm("編集内容を破棄し、初期データへ戻しますか？")) return;
        state = structuredClone(FestivalSeed);
        storageWarning = "";
        save("初期データへ戻しました");
        render();
      };
      $("#current-group").onchange = (e) => {
        state.groupId = e.target.value;
        save("操作する団体を変更しました");
      };
    }
  }
  $("#edit-form").addEventListener("input", (e) => {
    if (editing?.original && e.target.name && editing.p !== "expenses")
      editing.row[e.target.name] =
        e.target.type === "number" ? Number(e.target.value) : e.target.value;
  });
  $("#equipment-condition-form").onsubmit = (e) => {
    e.preventDefault();
    const equipmentId = $("#equipment-condition-id").value;
    const action = $("#equipment-condition-action").value;
    const error = D.recordEquipmentCondition(
      state,
      equipmentId,
      action,
      $("#equipment-condition-quantity").value,
      $("#equipment-condition-reason").value,
      $("#equipment-condition-date").value,
    );
    if (error) {
      toast(error);
      return;
    }
    const equipment = state.equipment.find((item) => item.id === equipmentId);
    save(
      equipment.name +
        (action === "restore"
          ? "の修理・使用可能への復帰を記録しました"
          : "の使用不可を記録しました"),
    );
    $("#equipment-condition-dialog").close();
    render();
  };
  $("#cancel-equipment-condition").onclick = () =>
    $("#equipment-condition-dialog").close();
  $("#close-equipment-condition").onclick = () =>
    $("#equipment-condition-dialog").close();
  $("#edit-form").onsubmit = (e) => {
    e.preventDefault();
    const { p, id } = editing;
    const r = {
      ...(editing.row || {}),
      ...Object.fromEntries(new FormData(e.target)),
    };
    fields[p]
      .filter((f) => f[2] === "number")
      .forEach((f) => (r[f[0]] = Number(r[f[0]])));
    r.id = id || D.nextId(state[p], prefixes[p]);
    if (p === "equipment") {
      const previous = id
        ? state.equipment.find((item) => item.id === id)
        : null;
      r.unavailableCount = previous?.unavailableCount || 0;
      r.conditionHistory = previous?.conditionHistory || [];
    }
    if (p === "lostItems") {
      const previous = id
        ? state.lostItems.find((item) => item.id === id)
        : null;
      r.status = previous?.status || "held";
      r.returnedAt = previous?.returnedAt || "";
    }
    const original = id ? state[p].find((item) => item.id === id) : null;
    if (
      p === "applications" &&
      r.status === "submitted" &&
      (!original || original.status !== "submitted") &&
      !D.canSubmitApplication(state, r.groupId)
    ) {
      toast("受付期間外のため、この団体の申請は提出できません");
      return;
    }
    const groupLocked = original && isGroupLocked(p, original);
    if (
      groupLocked &&
      String(r.groupId ?? "") !== String(original.groupId ?? "")
    ) {
      toast("承認済みの申請は団体を変更できません");
      return;
    }
    if (groupLocked) r.groupId = original.groupId;
    const error = validate(p, r);
    if (error) {
      toast(error);
      return;
    }
    if (p === "expenses") r.amount = D.roundedAmount(r.amount);
    if (id) state[p][state[p].findIndex((x) => x.id === id)] = r;
    else state[p].push(r);
    save(pages[p][1] + "を保存しました");
    $("#editor").close();
    render();
  };
  function closeEditor() {
    $("#editor").close();
    editing = null;
    render();
  }
  $("#close-dialog").onclick = closeEditor;
  $("#cancel-dialog").onclick = closeEditor;
  $("#editor").addEventListener("cancel", () => {
    editing = null;
    setTimeout(render, 0);
  });
  $("#role").onchange = (e) => {
    state.role = e.target.value;
    save("操作する役割を変更しました");
    render();
  };
  window.addEventListener("hashchange", () => {
    filterText = "";
    filterScope = "name";
    filterStatus = "";
    sortKey = "id";
    render();
  });
  render();
})();
