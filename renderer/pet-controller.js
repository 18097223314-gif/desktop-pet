// ══════════════════════════════════════════════
// 主控制器 — 连接引擎与UI
// 负责事件分发、交互处理、特效、自定义拖拽
// v2: 动画走 AnimationSystem.setStatus()，表情独立管理
// ══════════════════════════════════════════════

(function () {
  'use strict';

  // ─── 创建引擎 ───
  const engine = new PetEngineModule.PetEngine();

  // ─── DOM 引用 ───
  const petEl  = document.getElementById('pet');
  const petSvg = document.getElementById('pet-svg');
  const bubble = document.getElementById('bubble');
  const zzz    = document.getElementById('zzz');
  const nameTag = document.getElementById('name-tag');

  // ─── 初始化子系统 ───
  AnimationSystem.init(petSvg, petEl);
  BubbleComponent.init(bubble, engine);
  StatusBarComponent.init(engine);

  // ─── 暴露 setExpression 给 AnimationSystem 回调 ───
  // 在文件末尾通过 window.__petSetExpression 暴露

  // ══════════════════════════════════════════════
  // 自定义拖拽（替代 -webkit-app-region: drag）
  // 透明窗口下 CSS drag 对透明像素无效，必须用 IPC 移动窗口
  // ══════════════════════════════════════════════
  const DRAG_THRESHOLD = 4; // 像素，区分点击和拖拽
  let isDragging = false;
  let dragStarted = false;   // 超过阈值才算真正拖拽
  let wasDragged = false;    // 本次 mousedown→mouseup 期间是否发生了拖拽（用于屏蔽 click）
  let lastScreenX = 0;
  let lastScreenY = 0;
  let mouseDownX = 0;
  let mouseDownY = 0;
  let mouseDownTime = 0;

  // 整个窗口都可以拖拽（鼠标按下即进入准备拖拽状态）
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // 只处理左键
    isDragging = true;
    dragStarted = false;
    wasDragged = false;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    mouseDownTime = Date.now();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const dx = e.clientX - mouseDownX;
    const dy = e.clientY - mouseDownY;

    // 超过阈值才开始拖拽
    if (!dragStarted && (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
      dragStarted = true;
      // 拖拽时播放动画
      if (petSvg) {
        petSvg.classList.remove('anim-idle', 'anim-walk', 'anim-sit', 'anim-sleep');
        petSvg.classList.add('anim-dragged');
      }
    }

    if (dragStarted) {
      const deltaX = e.screenX - lastScreenX;
      const deltaY = e.screenY - lastScreenY;
      lastScreenX = e.screenX;
      lastScreenY = e.screenY;
      // 通过 IPC 移动窗口
      if (window.petAPI && window.petAPI.moveWindow) {
        window.petAPI.moveWindow(deltaX, deltaY);
      }
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (!isDragging) return;

    // 如果发生了拖拽，标记以屏蔽后续 click
    if (dragStarted) {
      wasDragged = true;
      if (petSvg) {
        petSvg.classList.remove('anim-dragged');
        petSvg.classList.add('anim-idle');
      }
    }

    isDragging = false;
    dragStarted = false;
  });

  // ─── 表情切换 (v12: 只管眼睛+嘴巴+腮红+汗珠，body 动画走 AnimationSystem) ───
  const allEyeIds   = ['eyes-normal', 'eyes-happy', 'eyes-closed', 'eyes-angry', 'eyes-star', 'eyes-surprised', 'eyes-sick'];
  const allMouthIds = ['mouth-normal', 'mouth-happy', 'mouth-angry', 'mouth-surprised', 'mouth-sick'];

  function hideAll(except) {
    const ids = except || [];
    allEyeIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && !ids.includes(id)) el.hidden = true;
    });
    allMouthIds.forEach(id => {
      const el = document.getElementById(id);
      if (el && !ids.includes(id)) el.hidden = true;
    });
  }

  function setExpression(mood) {
    hideAll();
    const blush = document.getElementById('blush-group');
    if (blush) blush.setAttribute('opacity', '0');
    const sweat = document.getElementById('sweat-drop');
    if (sweat) sweat.hidden = true;
    // v12: 不再清除 body 动画类（由 AnimationSystem 管理）

    switch (mood) {
      case 'happy':
        showEye('eyes-happy'); showMouth('mouth-happy');
        if (blush) blush.setAttribute('opacity', '0.7');
        // 尾巴摆动交给 AnimationSystem.setStatus
        break;
      case 'ecstatic':
        showEye('eyes-star'); showMouth('mouth-happy');
        if (blush) blush.setAttribute('opacity', '0.85');
        break;
      case 'angry':
        showEye('eyes-angry'); showMouth('mouth-angry');
        // shake 动画通过 playOneShot
        AnimationSystem.playOneShot('anim-shake', 600, AnimationSystem.STATES.IDLE);
        break;
      case 'surprised':
        showEye('eyes-surprised'); showMouth('mouth-surprised');
        AnimationSystem.playOneShot('anim-wiggle', 1000, AnimationSystem.STATES.IDLE);
        break;
      case 'sleeping':
        showEye('eyes-closed'); showMouth('mouth-normal');
        // body sleep 动画 + Zzz 由 AnimationSystem.setStatus 管理
        break;
      case 'sick':
        showEye('eyes-sick'); showMouth('mouth-sick');
        if (sweat) sweat.hidden = false;
        break;
      case 'unhappy':
        showEye('eyes-normal'); showMouth('mouth-angry');
        break;
      default:
        showEye('eyes-normal'); showMouth('mouth-normal');
    }
  }

  // 暴露给 AnimationSystem 回调使用
  window.__petSetExpression = setExpression;

  function showEye(id) {
    allEyeIds.forEach(i => {
      const el = document.getElementById(i);
      if (el) el.hidden = true;
    });
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  function showMouth(id) {
    allMouthIds.forEach(i => {
      const el = document.getElementById(i);
      if (el) el.hidden = true;
    });
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  // ─── 特效 ───
  function spawnFloat(text, x, y) {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = text;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1200);
  }

  function spawnHearts(n) {
    n = n || 6;
    if (!petEl) return;
    const r = petEl.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const h = document.createElement('div');
        h.className = 'heart-particle';
        h.textContent = ['❤️', '💕', '💖', '💗', '🩷', '😻'][Math.floor(Math.random() * 6)];
        h.style.left = (r.left + r.width / 2 + (Math.random() - 0.5) * 50) + 'px';
        h.style.top = (r.top + (Math.random() - 0.5) * 20) + 'px';
        document.body.appendChild(h);
        setTimeout(() => h.remove(), 1500);
      }, i * 120);
    }
  }

  function jump() {
    AnimationSystem.playOneShot('anim-jump', 550, AnimationSystem.STATES.IDLE);
  }

  function wave(dir) {
    const pawId = dir === 'left' ? 'paw-left' : 'paw-right';
    const paw = document.getElementById(pawId);
    if (!paw) return;
    paw.style.transition = 'transform 0.3s';
    paw.style.transform = 'translateY(-14px) rotate(-15deg)';
    setTimeout(() => {
      paw.style.transform = '';
      setTimeout(() => paw.style.transition = '', 300);
    }, 350);
  }

  // ─── 眼睛跟随鼠标 ───
  document.addEventListener('mousemove', (e) => {
    if (isDragging && dragStarted) return; // 拖拽时不跟随
    const state = engine.getState();
    if (state.isSleeping || state.mood === 'sick') return;
    const eyeL = document.getElementById('eye-l');
    const eyeR = document.getElementById('eye-r');
    if (!petEl) return;
    const r = petEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + 32;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const dist = 2.5;
    const ox = Math.cos(angle) * dist;
    const oy = Math.sin(angle) * dist;
    if (eyeL) eyeL.style.transform = `translate(${ox}px,${oy}px)`;
    if (eyeR) eyeR.style.transform = `translate(${ox}px,${oy}px)`;
  });

  // ══════════════════════════════════════════════
  // 交互事件 — 区分点击与拖拽
  // ══════════════════════════════════════════════
  let lastClick = 0;

  // 点击事件：只在未拖拽时触发
  petEl.addEventListener('click', (e) => {
    // 如果刚完成拖拽，忽略这次 click
    if (wasDragged) {
      wasDragged = false;
      return;
    }
    e.stopPropagation();

    const now = Date.now();
    if (now - lastClick < 420) {
      // 双击 = 抱抱
      engine.click('double');
    } else {
      const result = engine.click('normal');
      if (result.action === 'wokeUp') {
        petEl.classList.remove('is-sleeping');
        setExpression('surprised');
        BubbleComponent.say('surprised');
        setTimeout(() => setExpression(engine.getMood()), 1800);
      }
    }
    lastClick = now;
  });

  // 右键菜单 → 用原生 Menu（通过 IPC，不会被窗口裁切）
  petEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.petAPI && window.petAPI.showContextMenu) {
      window.petAPI.showContextMenu();
    }
  });

  // 也允许在空白区域右键
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (window.petAPI && window.petAPI.showContextMenu) {
      window.petAPI.showContextMenu();
    }
  });

  // ─── 右键菜单回调（从主进程发回）───
  const menuCallbacks = {
    wave: () => {
      setExpression('happy');
      BubbleComponent.say('happy');
      wave('right');
      jump();
    },
    dance: () => {
      AnimationSystem.playOneShot('anim-wiggle', 1200, AnimationSystem.STATES.IDLE);
      setExpression('happy');
      BubbleComponent.say('happy');
    },
    sleep: () => {
      engine.useItem('SLEEP');
    },
    dressUp: () => {
      if (window.petAPI) window.petAPI.openPanel('dress-up');
    },
    inventory: () => {
      if (window.petAPI) window.petAPI.openPanel('inventory');
    },
    settings: () => {
      if (window.petAPI) window.petAPI.openPanel('settings');
    },
  };

  if (window.petAPI && window.petAPI.onContextMenuAction) {
    window.petAPI.onContextMenuAction((action) => {
      if (menuCallbacks[action]) menuCallbacks[action]();
    });
  }

  // ─── 改名 ───
  nameTag.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.petAPI) {
      window.petAPI.openPanel('settings');
    }
  });

  // ─── 引擎事件绑定 ───
  engine.on('interact', (data) => {
    if (data.type === 'love') {
      setExpression('ecstatic');
      BubbleComponent.say('love');
      jump();
      spawnHearts(6);
      setTimeout(() => setExpression(engine.getMood()), 2500);
    } else if (data.type === 'angry') {
      setExpression('angry');
      BubbleComponent.say('angry');
      setTimeout(() => setExpression(engine.getMood()), 2200);
    } else {
      setExpression('happy');
      BubbleComponent.say('happy');
      wave(Math.random() > 0.5 ? 'left' : 'right');
      setTimeout(() => setExpression(engine.getMood()), 2000);
    }
  });

  engine.on('itemUsed', (data) => {
    if (data.item.id === 'sleep') {
      petEl.classList.add('is-sleeping');
      BubbleComponent.say('sleeping', 3000);
    } else {
      const icons = {
        dried_fish: '🐟', cat_treat: '🧴', steak: '🥩',
        milk: '🥛', juice: '🧃', yarn_ball: '🧶',
        mouse_toy: '🪶', laser: '🔴', soap: '🛁',
        brush: '🪮', medicine: '💊',
      };
      if (petEl) {
        const r = petEl.getBoundingClientRect();
        spawnFloat(icons[data.item.id] || '✨', r.left + r.width / 2 - 8, r.top - 5);
      }
    }
  });

  engine.on('sleep', () => {
    petEl.classList.add('is-sleeping');
    setExpression('sleeping');
    BubbleComponent.say('sleeping', 3000);
  });

  engine.on('wokeUp', () => {
    petEl.classList.remove('is-sleeping');
    setExpression('surprised');
    BubbleComponent.say('wokeup');
    setTimeout(() => setExpression(engine.getMood()), 2000);
  });

  engine.on('randomEvent', (data) => {
    BubbleComponent.show(`📰 ${data.event.name}`, 2500);
    setExpression(data.result.mood || 'idle');
  });

  engine.on('disease', (data) => {
    BubbleComponent.show(`😿 得了${data.disease.name}！`, 3000);
    setExpression('sick');
  });

  engine.on('diseaseCured', () => {
    BubbleComponent.show('💊 好了！', 2000);
  });

  engine.on('levelUp', () => {
    jump();
    spawnHearts(8);
    setExpression('ecstatic');
    BubbleComponent.show('🎉 升级了！', 3000);
  });

  engine.on('tick', (data) => {
    // 自动更新表情（非临时状态时）
    if (!petSvg || !petSvg._tempMood) {
      setExpression(data.mood);
    }
    // 名字同步
    if (nameTag) nameTag.textContent = '🐾 ' + (data.name || '爪爪');
  });

  // ─── 监听主进程推送的宠物状态（v3: 同步 body 动画 + 心情）───
  // 后端 getStatus() 返回字段：
  //   state.state     → 'idle'|'walk'|'sleep'|'sit'|'eat'|'wash'|'play'|... (PET_STATES)
  //   state.emotion   → 'happy'|'normal'|'sick'|'hungry'|'dirty'|'tired'|'bored'|... (EMOTIONS)
  //   state.mood      → 数值 0~100（心情条，供 StatusBarComponent 使用）
  if (window.petAPI && window.petAPI.onPetStatePush) {
    window.petAPI.onPetStatePush((state) => {
      // 1. 更新迷你状态面板（条+数值）
      StatusBarComponent.updateMiniBars(state);

      // 2. 同步 body 动画状态（后端权威来源）
      // 用 state.state 作为行为，state.emotion 作为心情
      const behavior = state.state || 'idle';   // 'idle'|'walk'|'sleep'|'sit'|...
      const mood = state.emotion || 'normal';    // 'happy'|'normal'|'sick'|...
      AnimationSystem.autoState(behavior, mood);
    });
  }

  // ─── 启动 ───
  engine.start();
  setExpression(engine.getMood());

  // 开场动画
  setTimeout(() => {
    setExpression('happy');
    BubbleComponent.say('happy');
    wave('right');
    jump();
  }, 600);

})();
