// ══════════════════════════════════════════════
// i18n.js — 多语言模块
// 支持中文、英文、日文、韩文，自动检测系统语言
// ══════════════════════════════════════════════

'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

// 支持的语言列表
const SUPPORTED_LOCALES = ['zh-CN', 'en', 'ja', 'ko'];

// 默认语言
const DEFAULT_LOCALE = 'zh-CN';

// 回退语言
const FALLBACK_LOCALE = 'en';

class I18n {
  constructor() {
    /** @type {string} 当前语言 */
    this._locale = DEFAULT_LOCALE;

    /** @type {Object} 语言包缓存 */
    this._messages = {};

    /** @type {boolean} 是否已初始化 */
    this._initialized = false;
  }

  /**
   * 初始化 i18n 模块
   * @param {string} [locale] 指定语言，不传则自动检测
   */
  init(locale) {
    if (this._initialized) {
      console.warn('[I18n] 已初始化');
      return;
    }

    // 自动检测语言
    if (!locale) {
      locale = this._detectLocale();
    }

    // 加载所有语言包
    this._loadAllLocales();

    // 设置当前语言
    this.setLocale(locale);

    this._initialized = true;
    console.log('[I18n] 初始化完成，当前语言:', this._locale);
  }

  /**
   * 翻译函数
   * @param {string} key 翻译键，支持点号分隔（如 "menu.sleep"）
   * @param {Object} [params] 插值参数（如 {name: "发传单", time: "5分钟"}）
   * @returns {string} 翻译后的文本
   */
  t(key, params = {}) {
    if (!this._initialized) {
      console.warn('[I18n] 未初始化，返回键名:', key);
      return key;
    }

    // 从当前语言包获取
    let message = this._getFromLocale(this._locale, key);

    // 如果当前语言没有，回退到默认语言
    if (message === undefined && this._locale !== DEFAULT_LOCALE) {
      message = this._getFromLocale(DEFAULT_LOCALE, key);
      if (message !== undefined) {
        console.warn(`[I18n] 键 "${key}" 在 ${this._locale} 中缺失，使用 ${DEFAULT_LOCALE} 回退`);
      }
    }

    // 如果默认语言也没有，回退到英文
    if (message === undefined && this._locale !== FALLBACK_LOCALE) {
      message = this._getFromLocale(FALLBACK_LOCALE, key);
      if (message !== undefined) {
        console.warn(`[I18n] 键 "${key}" 在 ${DEFAULT_LOCALE} 中缺失，使用 ${FALLBACK_LOCALE} 回退`);
      }
    }

    // 如果都没有，返回键名并警告
    if (message === undefined) {
      console.warn(`[I18n] 键 "${key}" 在所有语言中均缺失`);
      return key;
    }

    // 插值处理
    return this._interpolate(message, params);
  }

  /**
   * 设置当前语言
   * @param {string} locale 语言代码
   */
  setLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) {
      console.warn(`[I18n] 不支持的语言: ${locale}，回退到 ${FALLBACK_LOCALE}`);
      locale = FALLBACK_LOCALE;
    }

    this._locale = locale;
    console.log('[I18n] 语言已切换为:', locale);
  }

  /**
   * 获取当前语言
   * @returns {string} 当前语言代码
   */
  getLocale() {
    return this._locale;
  }

  /**
   * 获取支持的语言列表
   * @returns {string[]} 支持的语言代码列表
   */
  getSupportedLocales() {
    return [...SUPPORTED_LOCALES];
  }

  /**
   * 检测系统语言
   * @returns {string} 检测到的语言代码
   * @private
   */
  _detectLocale() {
    try {
      const systemLocale = app.getLocale();
      console.log('[I18n] 系统语言:', systemLocale);

      // 精确匹配
      if (SUPPORTED_LOCALES.includes(systemLocale)) {
        return systemLocale;
      }

      // 前缀匹配（如 "zh" → "zh-CN"）
      const prefix = systemLocale.split('-')[0];
      const match = SUPPORTED_LOCALES.find((l) => l.startsWith(prefix));
      if (match) {
        return match;
      }

      // 不在支持列表中，回退到英文
      console.log('[I18n] 系统语言不在支持列表中，回退到英文');
      return FALLBACK_LOCALE;
    } catch (err) {
      console.warn('[I18n] 检测系统语言失败:', err.message);
      return FALLBACK_LOCALE;
    }
  }

  /**
   * 加载所有语言包
   * @private
   */
  _loadAllLocales() {
    const localesDir = path.join(__dirname, '..', 'locales');

    for (const locale of SUPPORTED_LOCALES) {
      const filePath = path.join(localesDir, `${locale}.json`);

      try {
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8');
          this._messages[locale] = JSON.parse(content);
          console.log('[I18n] 已加载语言包:', locale);
        } else {
          console.warn('[I18n] 语言包不存在:', filePath);
          this._messages[locale] = {};
        }
      } catch (err) {
        console.error('[I18n] 加载语言包失败:', locale, err.message);
        this._messages[locale] = {};
      }
    }
  }

  /**
   * 从指定语言包获取翻译
   * @param {string} locale 语言代码
   * @param {string} key 翻译键
   * @returns {string|undefined} 翻译文本
   * @private
   */
  _getFromLocale(locale, key) {
    const messages = this._messages[locale];
    if (!messages) {
      return undefined;
    }

    // 支持点号分隔的键路径
    const keys = key.split('.');
    let value = messages;

    for (const k of keys) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[k];
    }

    return typeof value === 'string' ? value : undefined;
  }

  /**
   * 插值处理
   * @param {string} message 模板字符串
   * @param {Object} params 参数
   * @returns {string} 处理后的字符串
   * @private
   */
  _interpolate(message, params) {
    return message.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key] !== undefined ? params[key] : match;
    });
  }
}

// 导出单例
module.exports = new I18n();
