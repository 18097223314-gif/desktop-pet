// ══════════════════════════════════════════════
// 动画系统 — Canvas 逐帧精灵图引擎 (Neko spritesheet)
// 素材：assets/characters/cat/spritesheet-64x64.png (896x4608, 64x64单帧, 14列72行)
// 配置：assets/characters/cat/meta.json (rowMap格式)
// v6: 统一状态管线 applyState, 优先级抢占, 通用 oneShot
// ══════════════════════════════════════════════

const AnimationSystem = (() => {
  'use strict';

  // 动画状态
  const STATES = {
    IDLE: 'idle',
    WALK: 'walk',
    SIT: 'sit',
    RUN: 'run',
    DRAGGED: 'dragged',
    SLEEP: 'sleep',
  };

  // Canvas 参数
  const FRAME_SIZE = 64;
  const SCALE = 2;
  const CANVAS_SIZE = FRAME_SIZE * SCALE; // 128

  // 内部状态
  let canvasEl = null;
  let ctx = null;
  let petEl = null;

  // 精灵图
  let spriteImg = null;
  let meta = null;
  let columns = 14;

  // 当前动画
  let currentAnim = 'idle'; // meta.json animations 的key
  let currentState = STATES.IDLE;
  let currentFrame = 0;
  let frameAccumulator = 0;
  let lastTimestamp = 0;
  let animRequestId = null;

  // ─── 优先级系统 ───
  // Lower number = higher priority
  const PRIORITY = {
    dragged: 0, // P0: critical (user interaction)
    sick: 1,
    sleep: 1, // P1: health
    eat: 2,
    wash: 2,
    play: 2,
    ball: 2,
    dance: 2, // P2: activity
    read: 2,
    petting: 2,
    sulking: 2,
    wakeup: 2,
    attention: 2,
    work: 2,
    walk: 3,
    run: 3,
    sit: 3, // P3: movement
    idle: 4, // P4: default
  };
  const DEFAULT_PRIORITY = 4;
  const MIN_DWELL = 3000; // 同优先级防抖 3s (anti-flicker)
  let lastAnimSwitchTime = 0;
  let lastSwitchPriority = DEFAULT_PRIORITY;

  // ─── 通用 oneShot 系统 ───
  // oneShotQueue: [{animName, loopAfter}, ...]
  // When a oneShot animation finishes one full cycle (frame wraps to 0),
  // automatically transition to loopAfter
  let oneShotQueue = [];

  // ─── 持久CSS循环动画 ───
  // 用于dance/sulking等需要持续播放的CSS动画
  // 行为切换时自动移除上一个循环CSS类
  let _currentCssLoopClass = null;

  // ─── 行为→动画映射 ───
  // Map ALL 16 backend PET_STATES to actual animations
  // Each entry: { anim: string, loopAfter?: string, oneShot?: boolean, cssOneShot?: {cls, dur}, cssLoop?: string }
  //   oneShot=true means sprite-level oneShot (play anim once, then auto-transition to loopAfter)
  //   cssOneShot means CSS class overlay on canvas + immediate sprite switch to anim
  //   cssLoop means persistent CSS class that loops until behavior changes
  const BEHAVIOR_MAP = {
    idle: { anim: 'idle' },
    walk: { anim: 'walk' },
    sit: { anim: 'sit' },
    sleep: { anim: 'begin', loopAfter: 'sleep', oneShot: true },
    run: { anim: 'sprint' },
    eat: { anim: 'idle', cssOneShot: { cls: 'anim-jump', dur: 550 } },
    wash: { anim: 'idle', cssOneShot: { cls: 'anim-wiggle', dur: 600 } },
    play: { anim: 'idle', cssOneShot: { cls: 'anim-jump', dur: 550 } },
    ball: { anim: 'idle', cssOneShot: { cls: 'anim-jump', dur: 550 } },
    dance: { anim: 'idle', cssLoop: 'anim-dance' },
    read: { anim: 'sit' },
    petting: { anim: 'idle', cssOneShot: { cls: 'anim-wiggle', dur: 600 } },
    sulking: { anim: 'idle', cssLoop: 'anim-sulking' },
    wakeup: { anim: 'idle', cssOneShot: { cls: 'anim-stretch', dur: 1500 } },
    attention: { anim: 'idle', cssOneShot: { cls: 'anim-shake', dur: 600 } },
    work: { anim: 'sit' },
    sick: { anim: 'sleep' },
  };

  // ─── 加载 ───

  function loadMeta() {
    return fetch('../assets/characters/cat/meta.json')
      .then((r) => r.json())
      .then((data) => {
        // 新格式：{ meta: { columns }, rowMap: { key: { startRow, endRow, frames, fps } } }
        // 旧格式：{ columns, animations: { key: { row, frames, fps } }, stateMap }
        const rawColumns = (data.meta && data.meta.columns) || data.columns || 14;
        columns = rawColumns;

        // 如果已有 animations 字段（旧格式），直接用
        if (data.animations) {
          meta = data;
          return;
        }

        // 新格式：从 rowMap 构建 animations 兼容对象
        const animations = {};
        const rowMap = data.rowMap || {};
        for (const [key, val] of Object.entries(rowMap)) {
          animations[key] = {
            startRow: val.startRow,
            endRow: val.endRow,
            frames: val.frames,
            fps: val.fps || 8,
            loop: val.loop !== false,
          };
        }

        // 构建 stateMap（新格式没有，从 stateTransitions 推导或用默认）
        const stateMap = data.stateMap || {
          idle: 'idle',
          walk: 'walk',
          run: 'sprint',
          sleep: 'sleep',
          dragged: 'run',
          sit: 'sit',
        };

        meta = { animations, stateMap, columns: rawColumns };
        console.log('[Animation] meta loaded, animations:', Object.keys(animations), 'columns:', rawColumns);
      })
      .catch((err) => {
        console.error('[Animation] meta.json 加载失败，使用硬编码降级:', err);
        // 降级：硬编码
        columns = 14;
        meta = {
          columns: 14,
          animations: {
            idle: { startRow: 0, endRow: 3, frames: 56, fps: 4 },
            walk: { startRow: 4, endRow: 7, frames: 56, fps: 6 },
            scratch: { startRow: 17, endRow: 17, frames: 14, fps: 4 },
            begin: { startRow: 8, endRow: 8, frames: 14, fps: 4 },
            sleep: { startRow: 44, endRow: 47, frames: 56, fps: 3 },
            run: { startRow: 28, endRow: 31, frames: 56, fps: 6 },
          },
          stateMap: {
            idle: 'idle',
            walk: 'walk',
            run: 'sprint',
            sleep: 'sleep',
            dragged: 'run',
            sit: 'sit',
          },
        };
      });
  }

  function loadSprite() {
    return new Promise((resolve) => {
      spriteImg = new Image();
      spriteImg.src = '../assets/characters/cat/spritesheet.png';
      spriteImg.onload = () => {
        console.log('[Animation] sprite loaded:', spriteImg.naturalWidth, 'x', spriteImg.naturalHeight);
        resolve();
      };
      spriteImg.onerror = (e) => {
        console.error('[Animation] sprite FAILED to load:', spriteImg.src);
        resolve();
      };
    });
  }

  // ─── 渲染循环 ───

  function startLoop() {
    if (animRequestId) return;
    lastTimestamp = 0;
    frameAccumulator = 0;
    animRequestId = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (animRequestId) {
      cancelAnimationFrame(animRequestId);
      animRequestId = null;
    }
  }

  // 诊断：每秒打印当前动画+帧号
  let _diagCounter = 0;
  function tick(timestamp) {
    if (!ctx || !canvasEl) return;
    if (!lastTimestamp) lastTimestamp = timestamp;
    const delta = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    _diagCounter += delta;
    if (_diagCounter >= 2000) {
      _diagCounter = 0;
      const animDef = meta && meta.animations[currentAnim];
      console.log(
        `[DIAG] anim=${currentAnim} frame=${currentFrame}/${animDef ? animDef.frames : '?'} state=${currentState}`,
      );
    }

    //  advancing frame
    const animDef = meta.animations[currentAnim];
    if (animDef) {
      frameAccumulator += delta;
      const interval = 1000 / animDef.fps;
      while (frameAccumulator >= interval) {
        frameAccumulator -= interval;
        const prevFrame = currentFrame;
        // 顺序播放帧（loop=false 时停在最后一帧）
        if (animDef.loop === false && currentFrame >= animDef.frames - 1) {
          // 不循环动画：停在最后一帧
          frameAccumulator = 0;
          break;
        }
        currentFrame = (currentFrame + 1) % animDef.frames;

        // Generic oneShot transition detection:
        // When a oneShot animation finishes one full cycle (frame wraps from last to 0),
        // automatically transition to the loopAfter target animation
        if (oneShotQueue.length > 0 && currentFrame === 0 && prevFrame === animDef.frames - 1) {
          const entry = oneShotQueue.shift();
          if (entry && entry.loopAfter && meta.animations[entry.loopAfter]) {
            console.log('[Animation] oneShot → loop:', currentAnim, '→', entry.loopAfter);
            currentAnim = entry.loopAfter;
            currentFrame = 0;
            frameAccumulator = 0;
          }
        }
      }
    }

    // 清屏
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // 绘制当前帧
    if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0 && animDef) {
      let row, col;
      if (animDef._frameMap) {
        // 新格式：使用预构建的 frameMap（跳过 0 像素帧）
        const entry = animDef._frameMap[currentFrame];
        row = entry.row;
        col = entry.col;
      } else if (animDef.startRow !== undefined) {
        // rowMap 格式（无 frameMap）：按 columns 逐行铺
        const rowStep = animDef.rowStep || 1;
        const rowOffset = Math.floor(currentFrame / columns) * rowStep;
        col = currentFrame % columns;
        row = animDef.startRow + rowOffset;
      } else {
        // 旧格式降级
        col = currentFrame % columns;
        row = animDef.row;
      }
      const sx = col * FRAME_SIZE;
      const sy = row * FRAME_SIZE;

      ctx.drawImage(
        spriteImg,
        sx,
        sy,
        FRAME_SIZE,
        FRAME_SIZE, // source
        0,
        0,
        CANVAS_SIZE,
        CANVAS_SIZE, // dest (scaled 2×)
      );
    }

    animRequestId = requestAnimationFrame(tick);
  }

  // ─── 状态映射 helper ───

  function stateToAnim(state) {
    if (!meta || !meta.stateMap) return state;
    return meta.stateMap[state] || state;
  }

  // ─── 内部动画切换 ───

  function setAnim(animName) {
    if (!meta || !meta.animations[animName]) return;
    // 根本防护：动画相同时不重置帧，防止重复推送打断播放
    if (currentAnim === animName) return;
    console.log(`[Animation] setAnim: ${currentAnim} → ${animName}, frame reset`);
    currentAnim = animName;
    currentFrame = 0;
    frameAccumulator = 0;
    lastAnimSwitchTime = Date.now();
  }

  /**
   * Internal: apply a behavior's animation (no priority checks).
   * Handles mood overrides, sprite oneShots, CSS oneShots, and is-sleeping toggle.
   */
  function _applyBehavior(behavior, mood) {
    // Mood overrides: sick/sleeping mood → force sleep animation
    if (mood === 'sick' || mood === 'sleeping') {
      behavior = 'sleep';
    }

    const mapping = BEHAVIOR_MAP[behavior] || BEHAVIOR_MAP.idle;
    const targetAnim = mapping.anim;

    console.log(`[Animation] _applyBehavior: behavior=${behavior} mood=${mood} → anim=${targetAnim}`);

    // Clear any pending oneShots (new behavior takes over)
    oneShotQueue = [];

    // Remove previous persistent CSS loop class (e.g., anim-dance, anim-sulking)
    if (_currentCssLoopClass && canvasEl) {
      canvasEl.classList.remove(_currentCssLoopClass);
      _currentCssLoopClass = null;
    }

    // CSS oneShot overlay (e.g., anim-jump, anim-wiggle on canvas element)
    if (mapping.cssOneShot && canvasEl) {
      playOneShot(mapping.cssOneShot.cls, mapping.cssOneShot.dur);
    }

    // CSS loop overlay (persistent until behavior changes, e.g., anim-dance, anim-sulking)
    if (mapping.cssLoop && canvasEl) {
      canvasEl.classList.add(mapping.cssLoop);
      _currentCssLoopClass = mapping.cssLoop;
    }

    // Sprite-level oneShot (e.g., begin→sleep: play begin once, then auto-transition to sleep loop)
    if (mapping.oneShot && mapping.loopAfter) {
      oneShotQueue.push({ animName: targetAnim, loopAfter: mapping.loopAfter });
      setAnim(targetAnim);
    } else {
      setAnim(targetAnim);
    }

    // Update current state
    currentState = behavior;

    // is-sleeping CSS class toggle
    const isSleep = behavior === 'sleep' || behavior === 'sick';
    if (petEl) {
      petEl.classList.toggle('is-sleeping', isSleep);
    }
    const zzz = document.getElementById('zzz');
    if (zzz) zzz.classList.toggle('show', isSleep);
  }

  // ─── 统一状态管线 ───

  /**
   * Unified state pipeline entry point with priority-based preemption.
   *
   * Priority tiers (lower number = higher priority):
   *   P0 (critical): 'dragged' (user interaction)
   *   P1 (health):   'sick', 'sleep'
   *   P2 (activity): 'eat', 'wash', 'play', 'ball', 'dance', 'read', 'petting',
   *                  'sulking', 'wakeup', 'attention', 'work'
   *   P3 (movement): 'walk', 'run', 'sit'
   *   P4 (default):  'idle'
   *
   * Rules:
   *   - Higher priority (lower number) always interrupts lower immediately
   *   - Same priority: only switch if current animation has played at least 3s (anti-flicker)
   *   - Lower priority never interrupts higher
   *   - 'dragged' is set directly via setStatus, bypasses pipeline
   *
   * @param {string} behavior - one of the 16 PET_STATES
   * @param {string} mood - mood string ('sick', 'sleeping', etc.)
   * @param {boolean} [force=false] - bypass priority checks (used internally by setStatus)
   */
  function applyState(behavior, mood, force) {
    // Mood overrides happen inside _applyBehavior, but we need to resolve
    // the effective behavior for priority lookup too
    let effectiveBehavior = behavior;
    if (mood === 'sick' || mood === 'sleeping') {
      effectiveBehavior = 'sleep';
    }

    const pri = PRIORITY[effectiveBehavior] !== undefined ? PRIORITY[effectiveBehavior] : DEFAULT_PRIORITY;

    // Priority pipeline checks (skipped when force=true, e.g., from setStatus)
    if (!force) {
      // Lower priority trying to interrupt higher → blocked
      if (pri > lastSwitchPriority) {
        console.log(`[Animation] applyState: ${effectiveBehavior} (P${pri}) blocked by current P${lastSwitchPriority}`);
        return;
      }
      // Same priority: dwell lock (3s anti-flicker)
      if (pri === lastSwitchPriority) {
        const elapsed = Date.now() - lastAnimSwitchTime;
        if (elapsed < MIN_DWELL) {
          console.log(`[Animation] applyState: ${effectiveBehavior} dwell lock, ${elapsed}ms < ${MIN_DWELL}ms`);
          return;
        }
      }
      // Higher priority (pri < lastSwitchPriority): interrupt immediately — falls through
    }

    _applyBehavior(behavior, mood);
    lastSwitchPriority = pri;
  }

  // ─── 核心 API ───

  function init(canvas, container) {
    canvasEl = canvas || document.getElementById('pet-canvas');
    petEl = container || document.getElementById('pet');
    if (!canvasEl) return;
    ctx = canvasEl.getContext('2d');
    ctx.imageSmoothingEnabled = false; // 像素风不开平滑

    Promise.all([loadMeta(), loadSprite()]).then(() => {
      console.log('[Animation] init ready');
      // SCAN: 只过滤完全透明的空帧（alpha=0），保留所有有像素的过渡帧
      const offCanvas = document.createElement('canvas');
      offCanvas.width = FRAME_SIZE;
      offCanvas.height = FRAME_SIZE;
      const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
      for (const [animName, animDef] of Object.entries(meta.animations)) {
        if (animDef.startRow === undefined) continue;
        const origFrames = animDef.frames;
        const frameMap = [];
        for (let r = animDef.startRow; r <= animDef.endRow; r++) {
          for (let c = 0; c < columns; c++) {
            offCtx.clearRect(0, 0, FRAME_SIZE, FRAME_SIZE);
            offCtx.drawImage(
              spriteImg,
              c * FRAME_SIZE,
              r * FRAME_SIZE,
              FRAME_SIZE,
              FRAME_SIZE,
              0,
              0,
              FRAME_SIZE,
              FRAME_SIZE,
            );
            const data = offCtx.getImageData(0, 0, FRAME_SIZE, FRAME_SIZE).data;
            let hasPixels = false;
            for (let i = 3; i < data.length; i += 4) {
              if (data[i] > 0) {
                hasPixels = true;
                break;
              }
            }
            if (hasPixels) frameMap.push({ row: r, col: c });
          }
        }
        // 如果 meta.json 明确定义的帧数比 SCAN 找到的少，只取前 N 帧（如 idle 只要第 1 帧）
        if (origFrames > 0 && origFrames < frameMap.length) {
          frameMap.length = origFrames;
        }
        animDef.frames = frameMap.length;
        animDef._frameMap = frameMap;
        if (origFrames !== frameMap.length) {
          console.log(
            `[Animation][SCAN] ${animName}: ${origFrames} → ${frameMap.length} frames (filtered ${origFrames - frameMap.length} empty)`,
          );
          if (animName === 'scratch') {
            console.log(
              '[Animation][SCAN] scratch frameMap:',
              frameMap.map((f, i) => `[${i}] row=${f.row} col=${f.col}`).join(', '),
            );
          }
        } else {
          console.log(`[Animation] ${animName}: ${frameMap.length} frames, ${animDef.fps}fps`);
        }
      }
      setAnim('idle');
      startLoop();
    });
  }

  function getState() {
    return currentState;
  }

  /** setStatus — thin wrapper: direct status override (bypasses priority pipeline).
   *  Used by pet-controller for drag/drop, click interactions. */
  function setStatus(state, mood) {
    console.log('[Animation] setStatus called:', state, 'mood:', mood);
    applyState(state, mood, true); // force=true bypasses priority/dwell checks
  }

  /** autoState — thin wrapper: behavior from backend push (uses priority pipeline). */
  function autoState(behavior, mood) {
    console.log(`[Animation] autoState received: behavior=${behavior}, mood=${mood}, currentAnim=${currentAnim}`);
    applyState(behavior, mood);
  }

  /** setState — deprecated, kept for backward compatibility. */
  function setState(newState) {
    if (newState === currentState) return true;
    setStatus(newState, 'normal');
    return true;
  }

  /** 一次性动画（CSS class on canvas, e.g. jump/wiggle/shake/stretch） */
  function playOneShot(animClass, duration) {
    if (!canvasEl) return;
    canvasEl.classList.add(animClass);
    setTimeout(() => canvasEl.classList.remove(animClass), duration || 600);
  }

  return {
    init,
    setState,
    getState,
    setStatus,
    playOneShot,
    autoState,
    STATES,
    // 兼容旧引用
    ANIM_CLASSES: {
      idle: 'anim-idle',
      walk: 'anim-walk',
      sit: 'anim-sit',
      dragged: 'anim-dragged',
      sleep: 'anim-sleep',
    },
  };
})();
