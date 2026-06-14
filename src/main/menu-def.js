// ══════════════════════════════════════════════
// menu-def.js — 菜单定义单一来源 v2
// 右键菜单 + 托盘菜单共享定义，action 统一走 handleMenuAction
// ══════════════════════════════════════════════

'use strict';

/**
 * 宠物右键菜单定义（8 项主菜单 + 设置二级子菜单）
 * 每项：id / label / icon / action
 * - icon: renderer 端 SVG 相对路径（原生菜单忽略）
 * - action: handleMenuAction 统一处理的动作标识
 * - children: 二级子菜单（settings 专用）
 */
const PET_CONTEXT_MENU = [
  { id: 'sleep', label: '睡觉', icon: 'icons/icon-sleep.svg', action: 'sleep' },
  { id: 'status', label: '状态', icon: 'icons/icon-heart.svg', action: 'status' },
  { id: 'inventory', label: '道具包', icon: 'icons/icon-bag.svg', action: 'inventory' },
  { id: 'signin', label: '签到', icon: 'icons/icon-newspaper.svg', action: 'signin' },
  { id: 'work', label: '打工', icon: 'icons/icon-paw.svg', action: 'work' },
  { id: 'miniGame', label: '小游戏', icon: 'icons/icon-paw.svg', action: 'miniGame' },
  {
    id: 'settings',
    label: '设置',
    icon: 'icons/icon-settings.svg',
    action: 'settings',
    children: [
      { id: 'settingSound', label: '声音', action: 'settingSound' },
      { id: 'settingDisplay', label: '显示', action: 'settingDisplay' },
      { id: 'settingNotification', label: '通知', action: 'settingNotification' },
      { id: 'settingAbout', label: '关于', action: 'settingAbout' },
    ],
  },
  { id: 'quit', label: '退出', icon: 'icons/icon-door.svg', action: 'quit', danger: true },
];

/**
 * 托盘菜单项（从 PET_CONTEXT_MENU 子集 + 托盘专属项组成）
 */
const TRAY_MENU_ITEMS = [
  { id: 'show', label: '显示桌宠', action: '_showPet' },
  { id: 'hide', label: '隐藏桌宠', action: '_hidePet' },
  { id: 'status', label: '状态面板', action: 'status' },
  { type: 'separator' },
  // 开发模式 DevTools 项由 createTray() 动态插入
  { id: 'quit', label: '退出', action: 'quit' },
];

module.exports = {
  PET_CONTEXT_MENU,
  TRAY_MENU_ITEMS,
};
