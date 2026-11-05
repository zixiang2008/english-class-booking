/**
 * lib/platforms.js — online class platforms.
 *
 * The key is what gets stored in the database, so it must stay stable forever.
 * `label` is the English display name used by server-side surfaces (calendar
 * exports, JSON feeds); the browser translates `v3_platform_<key>` and falls
 * back to `label` when a language has no translation yet.
 */
const ONLINE_PLATFORMS = [
  { key: 'tencent_meeting', label: 'Tencent Meeting' },
  { key: 'zoom', label: 'Zoom' },
  { key: 'teams', label: 'Microsoft Teams' },
  { key: 'google_meet', label: 'Google Meet' },
  { key: 'voov', label: 'VooV Meeting' },
  { key: 'dingtalk', label: 'DingTalk' },
  { key: 'wechat', label: 'WeChat' },
  { key: 'other', label: 'Other' }
];

const PLATFORM_KEYS = ONLINE_PLATFORMS.map(p => p.key);

/** English label for a stored key; never throws, never returns an empty string. */
function platformLabel(key) {
  const hit = ONLINE_PLATFORMS.find(p => p.key === key);
  return hit ? hit.label : 'Online';
}

module.exports = { ONLINE_PLATFORMS, PLATFORM_KEYS, platformLabel };
