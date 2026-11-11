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
    numericDataWarning = "",
    filterText = "",
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
  numericDataWarning = inspectNumericData(state);
  const labels = {
    draft: "下書き",
    submitted: "承認待ち",
    approved: "承認済み",
    rejected: "差し戻し",
    cancelled: "取消",
    active: "対応中",
    reserved: "予約",
    returned: "返却済み",
    todo: "未着手",
    done: "完了",
  };
  const pages = {
    dashboard: ["◈", "ダッシュボード", "OVERVIEW"],
    groups: ["◎", "団体・メンバー", "ORGANIZATIONS"],
    applications: ["▤", "出店申請", "APPLICATIONS"],
    reservations: ["▦", "会場予約", "VENUES"],
    loans: ["▣", "備品・貸出", "EQUIPMENT"],
    expenses: ["¥", "予算・経費", "FINANCE"],
    shifts: ["◷", "スタッフ配置", "STAFF"],
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
    expenses: "X",
    shifts: "S",
    tasks: "T",
    notices: "N",
  };
  function page() {
    return location.hash.slice(1).split("?")[0] || "dashboard";
  }
  function today() {
    return new Date().toLocaleDateString("sv-SE");
  }
  function inspectNumericData(data) {
    const issues = [];
    (Array.isArray(data.expenses) ? data.expenses : []).forEach((expense) => {
      const error = D.validateExpense(expense || {});
      if (error)
        issues.push(
          `経費 ${expense?.id || "(IDなし)"}（金額=${expense?.amount}）: ${error}`,
        );
    });
    (Array.isArray(data.groups) ? data.groups : []).forEach((group) => {
      const error = D.validateBudget(group || {});
      if (error)
        issues.push(
          `団体 ${group?.id || "(IDなし)"}（予算=${group?.budget}）: ${error}`,
        );
    });
    (Array.isArray(data.loans) ? data.loans : []).forEach((loan) => {
      const error = D.validateQuantity(loan?.quantity);
      if (error)
        issues.push(
          `貸出 ${loan?.id || "(IDなし)"}（数量=${loan?.quantity}）: ${error}`,
        );
    });
    return issues.length
      ? `保存済みデータに不正な予算・金額・数量があります。${issues.join("、")}。該当レコードを一覧から確認してください。`
      : "";
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
      budget = state.groups.reduce((n, g) => n + Number(g.budget), 0);
    return (
      head(
        "運営の今を、ひと目で。",
        "申請から当日の配置まで、チームの動きをここに。",
      ) +
      `<div class="hero"><div><div class="eyebrow">NOVEMBER 14 — 15, 2026</div><h2>つながるアイデア、広がるキャンパス。</h2><p>学園祭の準備状況を確認して、今日の一歩を進めましょう。</p></div><div class="hero-mark">26 / F</div></div>` +
      `<div class="stats">${stat("出店申請", state.applications.length + "<small> 件</small>", "承認待ち " + D.pending(state) + " 件")}${stat("参加団体", state.groups.length + "<small> 団体</small>", "所属メンバー " + D.groupMembers(state) + " 名")}${stat("登録経費", money(D.expenses(state)), "総予算 " + money(budget))}${stat("タスク完了率", rate + "<small> %</small>", "期限超過 " + D.overdueTasks(state, today()).length + " 件")}</div>` +
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
      `<div class="grid2">${panel("団体別の予算残額", state.groups.map((g) => `<div class="metric-line"><span>${esc(g.name)}</span><b>${money(D.remaining(state, g.id))}</b></div><div class="progress"><span style="width:${Math.max(0, Math.min(100, ((g.budget - D.expenses(state, g.id)) / Math.max(1, g.budget)) * 100))}%"></span></div>`).join(""))}${panel(
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
    return esc(r[k]);
  }
  function renderList(p) {
    let rows = p === "notices" ? D.notices(state, state.groupId) : state[p];
    rows = D.search(rows, filterText);
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
    if (p === "reservations")
      summary = `<div class="stats">${state.venues.map((v) => stat(esc(v.name), v.capacity + "<small> 名</small>", "予約 " + D.venueUsage(state, v.id) + " 件")).join("")}</div>`;
    if (p === "expenses")
      summary = `<div class="stats">${stat("登録経費合計", money(D.expenses(state)), "全団体の経費")}${stat("総予算", money(state.groups.reduce((n, g) => n + Number(g.budget), 0)), "団体ごとの予算を合算")}</div>`;
    const exportButton =
      '<button class="secondary" id="export-csv">CSV出力</button>';
    return (
      head(
        pages[p][1],
        `${state[p].length}件の登録データ。検索・編集して準備を進めましょう。`,
        `<button id="add-row">＋ 新規登録</button>`,
      ) +
      summary +
      `<div class="toolbar"><div class="filters"><input id="search" type="search" aria-label="一覧を検索" placeholder="キーワードで検索" value="${esc(filterText)}">${statuses.length ? `<select id="status-filter" aria-label="状態で絞り込み"><option value="">すべての状態</option>${statuses.map((s) => `<option value="${s}" ${filterStatus === s ? "selected" : ""}>${labels[s] || s}</option>`).join("")}</select>` : ""}<select id="sort" aria-label="並び順">${cols
        .filter((c) => !c[0].startsWith("_"))
        .map(
          (c) =>
            `<option value="${c[0]}" ${sortKey === c[0] ? "selected" : ""}>${c[1]}順</option>`,
        )
        .join(
          "",
        )}</select><span class="subtitle">${rows.length} 件表示</span></div>${exportButton}</div>` +
      `<div class="panel"><div class="table-scroll"><table><thead><tr>${cols.map((c) => `<th>${c[1]}</th>`).join("")}<th>操作</th></tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${cols.map((c) => `<td class="${["title", "body", "name"].includes(c[0]) ? "description" : ""}">${cell(r, c[0])}</td>`).join("")}<td><div class="actions"><button class="secondary small" data-edit="${esc(r.id)}">編集</button>${p === "applications" ? `<button class="small" data-approve="${esc(r.id)}">承認</button><button class="danger small" data-cancel="${esc(r.id)}">取消</button>` : ""}${p === "loans" ? `<button class="small" data-return="${esc(r.id)}">返却</button>` : ""}${p === "tasks" ? `<button class="small" data-done="${esc(r.id)}">完了</button>` : ""}<button class="danger small" data-delete="${esc(r.id)}">削除</button></div></td></tr>`).join("") : `<tr><td colspan="${cols.length + 1}" class="empty">該当するデータはありません。</td></tr>`}</tbody></table></div></div>`
    );
  }
  function renderSettings() {
    return (
      head("データを、手元に。", "保存・復元と、操作する団体を管理します。") +
      `<div class="help">これはブラウザ内で動く演習用システムです。ログイン認証や共同データ保存はありません。役割・団体の切り替えは業務操作の体験用です。同じデータで確認するときはJSONファイルを共有してください。端末やブラウザが変わると保存先も変わります。</div><div class="settings-grid">${panel("バックアップ", '<p>現在の業務データをJSONファイルとして保存します。</p><button id="backup">JSONを書き出す</button>')}${panel("データを復元", '<p>JSONファイルを読み込み、現在のデータを置き換えます。</p><input id="restore-file" aria-label="復元するJSON" type="file" accept=".json"><button id="restore" class="secondary">読み込む</button>')}${panel("操作する団体", `<p>団体代表として表示する団体を選択します。</p><select id="current-group" aria-label="操作する団体">${state.groups.map((g) => `<option value="${g.id}" ${g.id === state.groupId ? "selected" : ""}>${esc(g.name)}</option>`).join("")}</select>`)}${panel("サンプルデータへ戻す", '<p>編集内容を破棄して、最初の状態に戻します。実行前にバックアップを保存してください。</p><button id="reset" class="danger">初期データへ戻す</button>')}</div>`
    );
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
      (numericDataWarning
        ? `<div class="help">${esc(numericDataWarning)}</div>`
        : "") +
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
      expenseStatus: ["submitted", "approved", "rejected"],
      taskStatus: ["todo", "active", "done"],
      category: ["備品", "消耗品", "外注", "広報", "その他"],
    };
    return (map[type] || []).map((s) => [s, labels[s] || s]);
  }
  function openEditor(p, id) {
    const original = id ? state[p].find((r) => r.id === id) : null;
    let row = original ? D.editCopy(original) : {};
    if (p === "expenses" && original) row = D.expenseForEdit(original);
    editing = { p, id, row, original };
    $("#dialog-title").textContent =
      pages[p][1] + " / " + (id ? "編集" : "新規登録");
    $("#form-fields").innerHTML = fields[p]
      .map(([k, label, type]) => {
        const value =
          row[k] ?? (type === "date" ? today() : type === "number" ? "0" : "");
        const numericText = ["amount", "budget", "quantity"].includes(k);
        const inputType = numericText ? "text" : type;
        const step = type === "number" && !numericText ? 'step="any"' : "";
        let input;
        if (type === "textarea")
          input = `<textarea name="${k}">${esc(value)}</textarea>`;
        else if (["text", "number", "date", "time"].includes(type))
          input = `<input name="${k}" type="${inputType}" ${step} value="${esc(value)}" ${["title", "name"].includes(k) ? "required" : ""}>`;
        else
          input = `<select name="${k}">${options(type)
            .map(
              ([v, t]) =>
                `<option value="${esc(v)}" ${String(value) === v ? "selected" : ""}>${esc(t)}</option>`,
            )
            .join("")}</select>`;
        return `<div class="field"><label for="field-${k}">${label}</label>${input.replace('name="' + k + '"', 'id="field-' + k + '" name="' + k + '"')}</div>`;
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
              "groupId",
              "venueId",
              "equipmentId",
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
    if (p === "groups") {
      const err = D.validateBudget(r);
      if (err) return err;
      if (D.duplicateGroup(state, r.name, r.id))
        return "同じ名前の団体が存在します";
    }
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
      r.quantity = D.normalizeInteger(r.quantity);
      const previous = state.loans.find((l) => l.id === r.id);
      const allowance =
        D.available(state, r.equipmentId) +
        (previous &&
        previous.equipmentId === r.equipmentId &&
        previous.status !== "reserved"
          ? Number(previous.quantity)
          : 0);
      if (r.status !== "returned" && r.quantity > allowance)
        return "貸出可能数を超えています";
    }
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
          D.csv(
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
          numericDataWarning = inspectNumericData(state);
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
        numericDataWarning = inspectNumericData(state);
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
  $("#edit-form").onsubmit = (e) => {
    e.preventDefault();
    const { p, id } = editing;
    const r = {
      ...(editing.row || {}),
      ...Object.fromEntries(new FormData(e.target)),
    };
    fields[p]
      .filter(
        (f) =>
          f[2] === "number" &&
          !["amount", "budget", "quantity"].includes(f[0]),
      )
      .forEach((f) => (r[f[0]] = Number(r[f[0]])));
    r.id = id || D.nextId(state[p], prefixes[p]);
    const error = validate(p, r);
    if (error) {
      toast(error);
      return;
    }
    fields[p]
      .filter((f) => ["amount", "budget", "quantity"].includes(f[0]))
      .forEach((f) => (r[f[0]] = D.normalizeInteger(r[f[0]])));
    if (id) state[p][state[p].findIndex((x) => x.id === id)] = r;
    else state[p].push(r);
    numericDataWarning = inspectNumericData(state);
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
    filterStatus = "";
    sortKey = "id";
    render();
  });
  render();
})();
