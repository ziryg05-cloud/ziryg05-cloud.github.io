/*
 * Tab Harbor — core heuristics (no LLM, no chrome APIs, no network).
 * Pure functions: usable in the extension, the demo page, and Node tests.
 *
 * A "tab" here is a plain object:
 *   { id, url, title, favIconUrl, windowId, index, openerTabId, groupId }
 */
(function () {
  "use strict";

  // Search engines whose result URLs carry the user's literal query.
  var SEARCH_HOSTS = [
    { re: /(^|\.)google\./, param: "q" },
    { re: /(^|\.)bing\.com$/, param: "q" },
    { re: /(^|\.)duckduckgo\.com$/, param: "q" },
    { re: /(^|\.)search\.yahoo\./, param: "p" },
    { re: /(^|\.)baidu\.com$/, param: "wd" },
    { re: /(^|\.)so\.com$/, param: "q" },
    { re: /(^|\.)sogou\.com$/, param: "query" },
    { re: /(^|\.)ecosia\.org$/, param: "q" },
    { re: /(^|\.)startpage\.com$/, param: "query" }
  ];

  // Pretty names for common sites (used for fallback group names).
  var SITE_NAMES = {
    github: "GitHub",
    stackoverflow: "Stack Overflow",
    youtube: "YouTube",
    google: "Google",
    mozilla: "MDN",
    reddit: "Reddit",
    twitter: "Twitter",
    x: "X",
    medium: "Medium",
    notion: "Notion",
    figma: "Figma",
    amazon: "Amazon",
    taobao: "淘宝",
    tmall: "天猫",
    jd: "京东",
    zhihu: "知乎",
    bilibili: "哔哩哔哩",
    douban: "豆瓣",
    wikipedia: "Wikipedia",
    npmjs: "npm",
    linkedin: "LinkedIn",
    rtings: "RTINGS",
    xiaohongshu: "小红书",
    weibo: "微博",
    bing: "Bing"
  };

  // Two-label overrides (checked before the single-label key).
  var SITE_NAMES_2 = {
    "developer.mozilla": "MDN",
    "outlook.office": "Outlook",
    "outlook.live": "Outlook"
  };

  var STOPWORDS = new Set(
    ("the a an and or of to in for on with how what why is are be do does your you my i it this that " +
      "at from by as use using guide tutorial docs documentation home page online free best top vs review " +
      "的 了 和 与 或 是 在 我 你 怎么 如何").split(/\s+/)
  );

  function safeUrl(u) {
    try { return new URL(u); } catch (e) { return null; }
  }

  function hostnameOf(u) {
    var url = safeUrl(u);
    return url ? url.hostname.replace(/^www\./, "") : "";
  }

  // Second-level label, e.g. "github" from "gist.github.com".
  function siteKey(u) {
    var host = hostnameOf(u);
    if (!host) return "";
    var parts = host.split(".");
    if (parts.length <= 2) return parts[0] || host;
    return parts[parts.length - 2];
  }

  function extractSearchQuery(u) {
    var url = safeUrl(u);
    if (!url) return "";
    for (var i = 0; i < SEARCH_HOSTS.length; i++) {
      if (SEARCH_HOSTS[i].re.test(url.hostname)) {
        var q = url.searchParams.get(SEARCH_HOSTS[i].param);
        if (q && q.trim()) return q.trim();
      }
    }
    return "";
  }

  function friendlyDomain(u) {
    var host = hostnameOf(u);
    if (!host) return "未知站点";
    var two = host.split(".").slice(0, 2).join(".");
    if (SITE_NAMES_2[two]) return SITE_NAMES_2[two];
    var key = siteKey(u);
    if (SITE_NAMES[key]) return SITE_NAMES[key];
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : host;
  }

  var SEPARATORS = /\s[-–—|·•:]\s/g;

  // Strip the site-name boilerplate that titles usually tack on.
  function cleanTitle(title, u) {
    if (!title) return "";
    var t = title.trim();
    var site = friendlyDomain(u).toLowerCase();
    var parts = t.split(SEPARATORS).map(function (s) { return s.trim(); }).filter(Boolean);
    if (parts.length > 1) {
      var filtered = parts.filter(function (p) {
        return p.toLowerCase() !== site && p.length > 1;
      });
      var pool = filtered.length ? filtered : parts;
      pool.sort(function (a, b) { return b.length - a.length; });
      t = pool[0];
    }
    return t;
  }

  function tokenize(s) {
    return s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter(function (w) {
        return w && w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w);
      });
  }

  // Most distinctive recurring words across a set of titles.
  function topKeywords(titles, max) {
    max = max || 2;
    var freq = new Map();
    var docCount = new Map();
    titles.forEach(function (t) {
      var seen = new Set();
      tokenize(t).forEach(function (w) {
        freq.set(w, (freq.get(w) || 0) + 1);
        if (!seen.has(w)) { docCount.set(w, (docCount.get(w) || 0) + 1); seen.add(w); }
      });
    });
    var words = Array.from(freq.keys());
    words.sort(function (a, b) {
      var dc = (docCount.get(b) || 0) - (docCount.get(a) || 0);
      if (dc) return dc;
      var fc = (freq.get(b) || 0) - (freq.get(a) || 0);
      if (fc) return fc;
      return b.length - a.length;
    });
    var chosen = [];
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (titles.length >= 2 && (docCount.get(w) || 0) < 2) continue; // require recurrence
      chosen.push(w);
      if (chosen.length >= max) break;
    }
    // Only fall back to a single word for a one-title group. For a multi-tab
    // group where nothing recurs, return nothing so the caller uses the site
    // name (e.g. a pile of unrelated YouTube tabs -> "YouTube", not a random word).
    if (!chosen.length && words.length && titles.length < 2) chosen.push(words[0]);
    return chosen.map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); });
  }

  function tidy(s) {
    s = s.replace(/\s+/g, " ").trim();
    return s.length > 60 ? s.slice(0, 57) + "…" : s;
  }

  function nameGroup(tabs) {
    // 1. Strongest signal: a search query the user literally typed.
    for (var i = 0; i < tabs.length; i++) {
      var q = extractSearchQuery(tabs[i].url);
      if (q) return tidy(q);
    }
    // 2. Recurring keywords across the titles.
    var titles = tabs.map(function (t) { return cleanTitle(t.title, t.url); }).filter(Boolean);
    var kw = topKeywords(titles, 2);
    if (kw.length) return kw.join(" · ");
    // 3. Friendly dominant site name.
    return friendlyDomain(tabs[0] && tabs[0].url);
  }

  function makeDSU(n) {
    var p = new Array(n);
    for (var i = 0; i < n; i++) p[i] = i;
    function find(x) { return p[x] === x ? x : (p[x] = find(p[x])); }
    function union(a, b) { p[find(a)] = find(b); }
    return { find: find, union: union };
  }

  /*
   * Group tabs using only code signals, in priority order:
   *   1. existing Chrome tab groups
   *   2. opener chains (a tab and the tab it was opened from = one thread)
   *   3. loose same-site singletons (stray tabs of one site clump together)
   * Leftover singletons collect into an "其它" bucket.
   */
  function groupTabs(tabs) {
    var n = tabs.length;
    if (!n) return [];
    var idToIndex = new Map();
    tabs.forEach(function (t, i) { idToIndex.set(t.id, i); });
    var dsu = makeDSU(n);

    // 1. existing chrome tab groups
    var byGroup = new Map();
    tabs.forEach(function (t, i) {
      if (t.groupId != null && t.groupId >= 0) {
        if (!byGroup.has(t.groupId)) byGroup.set(t.groupId, []);
        byGroup.get(t.groupId).push(i);
      }
    });
    byGroup.forEach(function (arr) { arr.forEach(function (i) { dsu.union(i, arr[0]); }); });

    // 2. opener chains
    tabs.forEach(function (t, i) {
      if (t.openerTabId != null && idToIndex.has(t.openerTabId)) {
        dsu.union(i, idToIndex.get(t.openerTabId));
      }
    });

    // snapshot which tabs are still on their own after steps 1-2
    var sizeAfter12 = new Map();
    tabs.forEach(function (t, i) {
      var r = dsu.find(i);
      sizeAfter12.set(r, (sizeAfter12.get(r) || 0) + 1);
    });
    function isLoose(i) { return sizeAfter12.get(dsu.find(i)) === 1; }

    // 3. same-site, but only among loose singletons (don't merge built clusters)
    var bySite = new Map();
    tabs.forEach(function (t, i) {
      var k = siteKey(t.url);
      if (!k) return;
      if (!bySite.has(k)) bySite.set(k, []);
      bySite.get(k).push(i);
    });
    bySite.forEach(function (arr) {
      var loose = arr.filter(isLoose);
      loose.forEach(function (i) { dsu.union(i, loose[0]); });
    });

    // collect clusters
    var clusters = new Map();
    tabs.forEach(function (t, i) {
      var r = dsu.find(i);
      if (!clusters.has(r)) clusters.set(r, []);
      clusters.get(r).push(t);
    });

    var groups = [];
    var others = [];
    clusters.forEach(function (arr) {
      if (arr.length === 1) {
        others.push(arr[0]);
      } else {
        var name = nameGroup(arr);
        groups.push({ tabs: arr, name: name, autoName: name });
      }
    });
    if (others.length) {
      groups.push({ tabs: others, name: "其它", autoName: "其它", isOther: true });
    }
    groups.sort(function (a, b) {
      return (a.isOther ? 1 : 0) - (b.isOther ? 1 : 0) || b.tabs.length - a.tabs.length;
    });
    return groups;
  }

  // Filter stored sessions by a query over name + tab title + url.
  function searchSessions(sessions, query) {
    var q = (query || "").trim().toLowerCase();
    if (!q) return sessions;
    var out = [];
    sessions.forEach(function (s) {
      var nameHit = (s.name || "").toLowerCase().indexOf(q) !== -1;
      if (nameHit) { out.push(s); return; }
      var tabs = (s.tabs || []).filter(function (t) {
        return (t.title || "").toLowerCase().indexOf(q) !== -1 ||
               (t.url || "").toLowerCase().indexOf(q) !== -1;
      });
      if (tabs.length) {
        var copy = Object.assign({}, s, { tabs: tabs });
        out.push(copy);
      }
    });
    return out;
  }

  // Category = the site/brand a tab belongs to (consistent and predictable).
  function categoryOf(u) {
    return friendlyDomain(u);
  }

  // Group tabs purely by category (site), biggest first; "其它" (if any) last.
  function categorize(tabs) {
    var cats = new Map();
    tabs.forEach(function (t) {
      var name = categoryOf(t.url);
      if (!cats.has(name)) cats.set(name, []);
      cats.get(name).push(t);
    });
    var out = [];
    cats.forEach(function (arr, name) {
      out.push({ name: name, autoName: name, tabs: arr, isOther: name === "其它" });
    });
    out.sort(function (a, b) {
      return (a.isOther ? 1 : 0) - (b.isOther ? 1 : 0) ||
        b.tabs.length - a.tabs.length ||
        a.name.localeCompare(b.name);
    });
    return out;
  }

  var API = {
    groupTabs: groupTabs,
    categorize: categorize,
    categoryOf: categoryOf,
    nameGroup: nameGroup,
    searchSessions: searchSessions,
    cleanTitle: cleanTitle,
    extractSearchQuery: extractSearchQuery,
    friendlyDomain: friendlyDomain,
    siteKey: siteKey,
    topKeywords: topKeywords
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  if (typeof window !== "undefined") window.TabHarborCore = API;
  if (typeof self !== "undefined") self.TabHarborCore = API;
})();
