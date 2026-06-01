// ══════════════════════════════════════════════
// 动画系统 — 状态机管理
// 状态：idle, walk, sit, dragged, wallClimb, sleep
// ══════════════════════════════════════════════

const AnimationSystem = (() => {
  'use strict';

  // 动画状态
  const STATES = {
    IDLE:       'idle',
    WALK:       'walk',
    SIT:        'sit',
    DRAGGED:    'dragged',
    WALL_CLIMB: 'wallClimb',
    SLEEP:      'sleep',
  };

  let currentState = STATES.IDLE;
  let svgEl = null;
  let stateMachine = null; // 状态转换表

  // 状态转换规则（合法转换）
  const TRANSITIONS = {
    [STATES.IDLE]:       [STATES.WALK, STATES.SIT, STATES.SLEEP, STATES.DRAGGED, STATES.WALL_CLIMB],
    [STATES.WALK]:       [STATES.IDLE, STATES.DRAGGED],
    [STATES.SIT]:        [STATES.IDLE, STATES.WALK, STATES.DRAGGED],
    [STATES.DRAGGED]:    [STATES.IDLE, STATES.WALK],
    [STATES.WALL_CLIMB]: [STATES.IDLE, STATES.WALK],
    [STATES.SLEEP]:      [STATES.IDLE], // 只能被唤醒回到 idle
  };

  // 动画类名映射
  const ANIM_CLASSES = {
    [STATES.IDLE]:       'anim-idle',
    [STATES.WALK]:       'anim-walk',
    [STATES.SIT]:        'anim-sit',
    [STATES.DRAGGED]:    'anim-dragged',
    [STATES.WALL_CLIMB]: 'anim-walldance',
    [STATES.SLEEP]:      'anim-sleep',
  };

  function init(el) {
    svgEl = el || document.getElementById('pet-svg');
    if (!svgEl) return;
  }

  function setState(newState) {
    if (!svgEl) return;
    // 检查转换合法性
    const allowed = TRANSITIONS[currentState] || [];
    if (newState !== currentState && !allowed.includes(newState)) {
      return false; // 不允许此转换
    }
    const oldClass = ANIM_CLASSES[currentState];
    const newClass = ANIM_CLASSES[newState];
    if (oldClass) svgEl.classList.remove(oldClass);
    if (newClass) svgEl.classList.add(newClass);
    currentState = newState;
    return true;
  }

  function getState() {
    return currentState;
  }

  // 临时动画（自动恢复）
  function playOneShot(animClass, duration, recoverState) {
    if (!svgEl) return;
    const oldClass = ANIM_CLASSES[currentState];
    svgEl.classList.remove(oldClass);
    svgEl.classList.add(animClass);
    setTimeout(() => {
      svgEl.classList.remove(animClass);
      const rec = recoverState || currentState;
      const recClass = ANIM_CLASSES[rec];
      if (recClass) svgEl.classList.add(recClass);
    }, duration || 600);
  }

  // 根据心情/状态自动选择动画
  function autoState(mood, isSleeping) {
    if (isSleeping) return setState(STATES.SLEEP);
    switch (mood) {
      case 'sleeping': return setState(STATES.SLEEP);
      case 'happy':
      case 'ecstatic': return setState(STATES.IDLE); // 表情由表情系统控制
      default: return setState(STATES.IDLE);
    }
  }

  return { init, setState, getState, playOneShot, autoState, STATES, ANIM_CLASSES };
})();
