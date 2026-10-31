// Keep export folders inside their intended parent on Windows and other hosts.
function safeFolderName(value, fallback) {
  const name = String(value || fallback).replace(/[\\/:*?"<>|]/g, '-').slice(0, 120).trim();
  return !name || /^\.+$/.test(name) ? fallback : name;
}

module.exports = { safeFolderName };
