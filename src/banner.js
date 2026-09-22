// ==UserScript==
// @name         B站成分雷达 (BiliRadardar)
// @version      1.2.0
// @author       xulaupuz,trychen,oyyo
// @namespace    trychen.com
// @license      GPLv3
// @description  支持B站 Shadow DOM 评论区检测，视口自动排队检测，内置最新图标与 onerror 防裂图机制，同UID检测结果自动复用缓存，source：https://github.com/trychen/bilibili-comment-checker
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/read/*
// @match        https://www.bilibili.com/bangumi/*
// @match        https://www.bilibili.com/opus/*
// @match        https://t.bilibili.com/*
// @match        https://space.bilibili.com/*
// @icon         https://static.hdslb.com/images/favicon.ico
// @connect      bilibili.com
// @connect      api.typesafe.ai
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// ==/UserScript==
