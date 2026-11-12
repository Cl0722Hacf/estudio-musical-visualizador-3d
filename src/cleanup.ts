// Limpieza única de sesiones guardadas con datos de prueba
try { if (!localStorage.getItem('studio.clean.v4')) { for (const k of Object.keys(localStorage)) if (k.startsWith('studio.')) localStorage.removeItem(k); localStorage.setItem('studio.clean.v4', '1') } } catch { /* sin acceso a localStorage */ }
export {}
