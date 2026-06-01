const electron = require('electron');
console.log('electron type:', typeof electron);
console.log('electron keys:', Object.keys(electron).slice(0, 10));
console.log('app:', typeof electron.app);
console.log('BrowserWindow:', typeof electron.BrowserWindow);
