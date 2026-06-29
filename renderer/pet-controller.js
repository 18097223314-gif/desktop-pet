// ══════════════════════════════════════════════
// 主控制器 — 连接引擎与UI
// 负责事件分发、交互处理、特效、自定义拖拽
// v4: Neko 精灵图方案，表情由精灵图自带，不再有独立表情系统
// ══════════════════════════════════════════════

(function () {
  'use strict';

  // ─── 创建引擎 ───
  const engine = new PetEngineModule.PetEngine();

  // ─── DOM 引用 ───
  const petEl = document.getElementById('pet');
  const petCanvas = document.getElementById('pet-canvas');
  const bubble = document.getElementById('bubble');
  const zzz = document.getElementById('zzz');
  const nameTag = document.getElementById('name-tag');

  // ─── 初始化子系统 ───
  AnimationSystem.init(petCanvas, petEl);
  BubbleComponent.init(bubble, engine);
  StatusBarComponent.init(engine);

  // ══════════════════════════════════════════════
  // 自定义拖拽（替代 -webkit-app-region: drag）
  // 透明窗口下 CSS drag 对透明像素无效，必须用 IPC 移动窗口
  // ══════════════════════════════════════════════
  const DRAG_THRESHOLD = 4; // 像素，区分点击和拖拽
  let isDragging = false;
  let dragStarted = false; // 超过阈值才算真正拖拽
  let wasDragged = false; // 本次 mousedown→mouseup 期间是否发生了拖拽（用于屏蔽 click）
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
      AnimationSystem.setStatus('dragged', engine.getMood());
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
      AnimationSystem.setStatus('idle', engine.getMood());
    }

    isDragging = false;
    dragStarted = false;
  });

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
        h.style.left = r.left + r.width / 2 + (Math.random() - 0.5) * 50 + 'px';
        h.style.top = r.top + (Math.random() - 0.5) * 20 + 'px';
        document.body.appendChild(h);
        setTimeout(() => h.remove(), 1500);
      }, i * 120);
    }
  }

  function jump() {
    AnimationSystem.playOneShot('anim-jump', 550);
  }

  function wave(dir) {
    // Neko 精灵图方案：用手势动画替代独立爪子 waving
    AnimationSystem.playOneShot('anim-wiggle', 600);
  }

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
        AnimationSystem.setStatus('idle', 'normal');
        BubbleComponent.say('surprised');
      }
    }
    lastClick = now;
  });

  // ─── 右键菜单 → 通知主进程弹出原生菜单 ───
  petEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (window.petAPI && window.petAPI.showNativeContextMenu) {
      window.petAPI.showNativeContextMenu();
    }
  });

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (window.petAPI && window.petAPI.showNativeContextMenu) {
      window.petAPI.showNativeContextMenu();
    }
  });

  // ─── 监听主进程菜单动作（pet:menu-action）───
  if (window.petAPI && window.petAPI.onMenuAction) {
    window.petAPI.onMenuAction(async (action) => {
      switch (action) {
        case 'sleep':
          engine.useItem('SLEEP');
          break;
        case 'inventory':
          window.petAPI.openPanel('inventory');
          break;
        case 'miniGame':
          window.petAPI.openPanel('mini-game');
          break;
        case 'work':
          window.petAPI.openPanel('work');
          break;
        case 'signin':
          window.petAPI.openPanel('signin');
          break;
        default:
          console.warn('[PetController] 未知菜单动作:', action);
      }
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
      AnimationSystem.setStatus('idle', 'ecstatic');
      BubbleComponent.say('love');
      jump();
      spawnHearts(6);
    } else if (data.type === 'angry') {
      AnimationSystem.setStatus('idle', 'angry');
      BubbleComponent.say('angry');
      AnimationSystem.playOneShot('anim-shake', 600);
    } else {
      AnimationSystem.setStatus('idle', 'happy');
      BubbleComponent.say('happy');
      wave(Math.random() > 0.5 ? 'left' : 'right');
    }
  });

  engine.on('itemUsed', (data) => {
    if (data.item.id === 'sleep') {
      petEl.classList.add('is-sleeping');
      BubbleComponent.say('sleeping', 3000);
    } else {
      const icons = {
        dried_fish: '🐟',
        cat_treat: '🧴',
        steak: '🥩',
        milk: '🥛',
        juice: '🧃',
        yarn_ball: '🧶',
        mouse_toy: '🪶',
        laser: '🔴',
        soap: '🛁',
        brush: '🪮',
        medicine: '💊',
      };
      if (petEl) {
        const r = petEl.getBoundingClientRect();
        spawnFloat(icons[data.item.id] || '✨', r.left + r.width / 2 - 8, r.top - 5);
      }
    }
  });

  engine.on('sleep', () => {
    petEl.classList.add('is-sleeping');
    AnimationSystem.setStatus('sleep', 'sleeping');
    BubbleComponent.say('sleeping', 3000);
  });

  engine.on('wokeUp', () => {
    petEl.classList.remove('is-sleeping');
    AnimationSystem.setStatus('idle', 'normal');
    BubbleComponent.say('wokeup');
  });

  engine.on('randomEvent', (data) => {
    BubbleComponent.show(`📰 ${data.event.name}`, 2500);
    AnimationSystem.setStatus('idle', data.result.mood || 'normal');
  });

  engine.on('disease', (data) => {
    BubbleComponent.show(`😿 得了${data.disease.name}！`, 3000);
    AnimationSystem.setStatus('sleep', 'sick');
  });

  engine.on('diseaseCured', () => {
    BubbleComponent.show('💊 好了！', 2000);
    AnimationSystem.setStatus('idle', 'happy');
  });

  engine.on('levelUp', () => {
    jump();
    spawnHearts(8);
    AnimationSystem.setStatus('idle', 'ecstatic');
    BubbleComponent.show('🎉 升级了！', 3000);
  });

  engine.on('tick', (data) => {
    // 名字同步
    if (nameTag) nameTag.textContent = '🐾 ' + (data.name || '爪爪');
  });

  // ─── 监听主进程推送的宠物状态 ───
  // 后端 getStatus() 返回字段：
  //   state.state     → 'idle'|'walk'|'sleep'|'sit'|'eat'|'wash'|'play'|... (PET_STATES)
  //   state.emotion   → 'happy'|'normal'|'sick'|'hungry'|'dirty'|'tired'|'bored'|... (EMOTIONS)
  //   state.mood      → 数值 0~100（心情条，供 StatusBarComponent 使用）
  if (window.petAPI && window.petAPI.onPetStatePush) {
    let lastState = '';
    let lastStateTime = 0;
    window.petAPI.onPetStatePush((state) => {
      const now = Date.now();
      const behavior = state.state || 'idle';
      const timeSinceLast = now - lastStateTime;
      console.log(`[PetController] state-push: ${behavior}, 距上次: ${timeSinceLast}ms, 上次状态: ${lastState}`);
      lastState = behavior;
      lastStateTime = now;

      // 1. 更新迷你状态面板（条+数值）
      StatusBarComponent.updateMiniBars(state);

      // 2. 同步动画状态（后端权威来源）
      const mood = state.emotion || 'normal';
      AnimationSystem.autoState(behavior, mood);
    });
  }

  // ─── 调试日志推送 ───
  if (window.petAPI && window.petAPI.onDebugLog) {
    window.petAPI.onDebugLog((msg) => {
      console.log('[DEBUG]', msg);
    });
  }

  // ══════════════════════════════════════════════
  // 升级 / 里程碑 / 进化 / 事件 推送通知
  // ══════════════════════════════════════════════

  // ─── 升级通知 ───
  if (window.petAPI && window.petAPI.onLevelUp) {
    window.petAPI.onLevelUp((data) => {
      console.log('[PetController] 升级推送:', data);
      const level = data.level || data.newLevel || '?';
      BubbleComponent.show(`🎉 升级了！ Lv.${level}`, 3500);
      jump();
      spawnHearts(10);
      AnimationSystem.setStatus('idle', 'ecstatic');
    });
  }

  // ─── 里程碑通知 ───
  if (window.petAPI && window.petAPI.onMilestone) {
    window.petAPI.onMilestone((data) => {
      console.log('[PetController] 里程碑推送:', data);
      const title = data.title || data.milestone || '里程碑';
      BubbleComponent.show(`🏆 ${title}`, 3500);
      spawnHearts(6);
      AnimationSystem.playOneShot('anim-wiggle', 600);
    });
  }

  // ─── 进化就绪通知 ───
  if (window.petAPI && window.petAPI.onEvolutionReady) {
    window.petAPI.onEvolutionReady((data) => {
      console.log('[PetController] 进化就绪推送:', data);
      BubbleComponent.show('⚡ 进化条件已满足！可以去进化了', 4000);
      AnimationSystem.playOneShot('anim-wiggle', 600);
      jump();
    });
  }

  // ─── 宠物事件通知 ───
  if (window.petAPI && window.petAPI.onPetEvent) {
    window.petAPI.onPetEvent((data) => {
      console.log('[PetController] 宠物事件推送:', data);
      const name = data.name || data.eventName || '事件';
      const emoji = data.emoji || '📢';
      BubbleComponent.show(`${emoji} ${name}`, 3000);
    });
  }

  // ─── 进化完成通知 ───
  if (window.petAPI && window.petAPI.onEvolved) {
    window.petAPI.onEvolved((data) => {
      console.log('[PetController] 进化完成推送:', data);
      const branchName = data.name || data.branch || '新形态';
      const color = data.color || '#FFD700';
      BubbleComponent.show(`✨ 进化完成！${branchName}`, 4000);
      spawnHearts(12);
      jump();
      AnimationSystem.setStatus('idle', 'ecstatic');
      // 闪光特效
      const flash = document.createElement('div');
      flash.style.cssText = `position:fixed;inset:0;background:${color};opacity:0.3;pointer-events:none;z-index:9999;transition:opacity 1s;`;
      document.body.appendChild(flash);
      setTimeout(() => { flash.style.opacity = '0'; }, 100);
      setTimeout(() => flash.remove(), 1200);
    });
  }

  // ─── 定时状态监控（调试用）───
  setInterval(() => {
    const animState = AnimationSystem.getState();
    console.log('[Monitor] 当前动画状态:', animState);
  }, 5000);

  // ─── 启动 ───
  engine.start();
  AnimationSystem.setStatus('idle', engine.getMood());

  // 开场动画
  setTimeout(() => {
    AnimationSystem.setStatus('idle', 'happy');
    BubbleComponent.say('happy');
    wave('right');
    jump();
  }, 600);
})();
