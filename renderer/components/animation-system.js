// ══════════════════════════════════════════════
// 动画系统 — 状态机管理
// 状态：idle, walk, sit, dragged, wallClimb, sleep
// v2: 新增 setStatus() 批量设置、autoState() 后端同步、精灵图加载 API
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
  let petEl = null; // 外层 #pet 容器（用于操作 is-sleeping class）

  // 状态转换规则（合法转换）
  // v2: walk 可作为中间状态自由进出（后端行为树推送 walk 时需要）
  const TRANSITIONS = {
    [STATES.IDLE]:       [STATES.WALK, STATES.SIT, STATES.SLEEP, STATES.DRAGGED, STATES.WALL_CLIMB],
    [STATES.WALK]:       [STATES.IDLE, STATES.SIT, STATES.DRAGGED, STATES.SLEEP],
    [STATES.SIT]:        [STATES.IDLE, STATES.WALK, STATES.DRAGGED],
    [STATES.DRAGGED]:    [STATES.IDLE, STATES.WALK],
    [STATES.WALL_CLIMB]: [STATES.IDLE, STATES.WALK],
    [STATES.SLEEP]:      [STATES.IDLE, STATES.WALK], // 被唤醒后可走可站
  };

  // 动画 CSS 类名映射（内联 SVG 模式）
  const ANIM_CLASSES = {
    [STATES.IDLE]:       'anim-idle',
    [STATES.WALK]:       'anim-walk',
    [STATES.SIT]:        'anim-sit',
    [STATES.DRAGGED]:    'anim-dragged',
    [STATES.WALL_CLIMB]: 'anim-walldance',
    [STATES.SLEEP]:      'anim-sleep',
  };

  // ─── 精灵图资源（运行时填充）───
  let spriteResources = null; // { idle: { src, frames, fps, frameSize }, ... }

  // ═══ 核心 API ═══

  function init(el, container) {
    svgEl = el || document.getElementById('pet-svg');
    petEl = container || document.getElementById('pet');
    if (!svgEl) return;
  }

  /**
   * 设置 body 动画状态（带转换合法性检查）
   * @param {string} newState - 目标状态
   * @returns {boolean} 是否成功转换
   */
  function setState(newState) {
    if (!svgEl) return false;
    if (newState === currentState) return true;
    const allowed = TRANSITIONS[currentState] || [];
    if (!allowed.includes(newState)) {
      return false;
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

  /**
   * 批量设置 body 状态 + mood（后端状态同步用）
   * 跳过转换检查，直接设为目标状态（后端是权威来源）
   * @param {string} bodyState - 身体动画状态 (idle/walk/sleep/...)
   * @param {string} mood - 心情 (happy/angry/sick/...)
   */
  function setStatus(bodyState, mood) {
    if (!svgEl) return;

    // 1. 直接设置 body 状态（跳过转换检查，后端权威）
    const oldClass = ANIM_CLASSES[currentState];
    const newClass = ANIM_CLASSES[bodyState];
    if (oldClass) svgEl.classList.remove(oldClass);
    if (newClass) svgEl.classList.add(newClass);
    else svgEl.classList.add(ANIM_CLASSES[STATES.IDLE]); // fallback
    currentState = bodyState || STATES.IDLE;

    // 2. 同步表情（委托给控制器的 setExpression）
    if (window.__petSetExpression) {
      window.__petSetExpression(mood || 'normal');
    }

    // 3. 同步 is-sleeping 类
    if (petEl) {
      petEl.classList.toggle('is-sleeping', bodyState === STATES.SLEEP);
    }

    // 4. 同步 Zzz 显示
    const zzz = document.getElementById('zzz');
    if (zzz) zzz.classList.toggle('show', bodyState === STATES.SLEEP);

    // 5. 同步尾巴摆动（happy 心情加速）
    const tail = document.getElementById('tail-group');
    if (tail) {
      if (mood === 'happy' || mood === 'ecstatic') {
        tail.style.animation = `tailWag ${mood === 'ecstatic' ? '0.18s' : '0.3s'} ease-in-out infinite`;
      } else {
        tail.style.animation = '';
      }
    }
  }

  /**
   * 临时动画（自动恢复，如 jump/wiggle）
   * @param {string} animClass - CSS 动画类名
   * @param {number} duration - 持续时间(ms)
   * @param {string} recoverState - 恢复后的状态
   */
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

  /**
   * 根据后端推送的 behavior + mood 自动选择动画状态
   * behavior 来源: 后端 PET_STATES (idle/walk/sleep/sit/eat/wash/play/dance/read/ball/petting/sulking/wakeup/attention/work/sick)
   * mood 来源: 后端 EMOTIONS (happy/normal/sick/hungry/dirty/tired/bored/excited/sad)
   */
  function autoState(behavior, mood) {
    // sick/sleeping 心情优先级最高（覆盖行为）
    if (mood === 'sick') {
      return setStatus(STATES.SLEEP, 'sick');
    }
    if (mood === 'sleeping') {
      return setStatus(STATES.SLEEP, 'sleeping');
    }

    // PET_STATES → AnimationSystem STATES 映射
    // 后端有 19 种状态，前端 CSS 动画覆盖 idle/walk/sit/sleep，其余用 playOneShot 或 IDLE 兜底
    switch (behavior) {
      // 直接匹配（有专属 CSS 循环动画）
      case 'sleep':   return setStatus(STATES.SLEEP, mood || 'normal');
      case 'walk':    return setStatus(STATES.WALK, mood || 'normal');
      case 'sit':     return setStatus(STATES.SIT, mood || 'normal');
      case 'idle':    return setStatus(STATES.IDLE, mood || 'normal');
      // playOneShot 闪现动画（有对应 CSS 动画但无独立状态）
      case 'dance':   playOneShot('anim-wiggle', 1200, STATES.IDLE); return setStatus(STATES.IDLE, mood || 'normal');
      case 'play':
      case 'ball':    playOneShot('anim-jump', 550, STATES.IDLE); return setStatus(STATES.IDLE, mood || 'normal');
      case 'wakeup':  playOneShot('anim-stretch', 800, STATES.IDLE); return setStatus(STATES.IDLE, mood || 'normal');
      // 静态行为（前端暂无对应精灵图动画，待 Phase 2 sprite 集成）
      case 'eat':
      case 'wash':
      case 'read':
      case 'petting':
      case 'sulking':
      case 'attention':
      case 'work':
      case 'sick':
      default:        return setStatus(STATES.IDLE, mood || 'normal');
    }
  }

  // ═══ 精灵图 API ═══

  /**
   * 加载精灵图资源描述
   * @param {Object} resources - { idle: { src, frames, fps, frameSize: { width, height } }, ... }
   */
  function loadSpriteResources(resources) {
    spriteResources = resources;
  }

  function getSpriteResources() {
    return spriteResources;
  }

  /**
   * 获取当前状态的精灵图信息
   * @returns {Object|null}
   */
  function getSpriteForState(state) {
    if (!spriteResources) return null;
    return spriteResources[state] || spriteResources[STATES.IDLE] || null;
  }

  return {
    init,
    setState,
    getState,
    setStatus,
    playOneShot,
    autoState,
    loadSpriteResources,
    getSpriteResources,
    getSpriteForState,
    STATES,
    ANIM_CLASSES,
  };
})();
