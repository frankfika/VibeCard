const PROFILE_KEY = 'vibecard_profile';
const THREADS_KEY = 'vibecard_threads';
const ACTIVITIES_KEY = 'vibecard_activities';
const GAME_KEY = 'vibecard_game';

const DEFAULT_PROFILE = {
  name: '', handle: '', avatar: '', bio: '', tags: [],
  lookingFor: '', canHelpWith: [], highlights: [],
  verified: { wallet: '', twitter: '', discord: '', wechat: '' },
  event: ''
};

const DEFAULT_GAME = { presetId: null, selectedTags: [], history: [], favorites: [] };

function getStorage(key, fallback) {
  try {
    const data = wx.getStorageSync(key);
    if (data !== '' && data !== null && data !== undefined) return data;
  } catch (e) {}
  return fallback;
}

function setStorage(key, data) {
  wx.setStorageSync(key, data);
}

// Profile
function getProfile() {
  return getStorage(PROFILE_KEY, DEFAULT_PROFILE);
}

function setProfile(updates) {
  const current = getProfile();
  const next = { ...current, ...updates };
  setStorage(PROFILE_KEY, next);
  return next;
}

function isProfileSetup() {
  return !!getProfile().name;
}

// Threads
function getThreads() {
  return getStorage(THREADS_KEY, []);
}

function addThread(thread) {
  const threads = [thread, ...getThreads()];
  setStorage(THREADS_KEY, threads);
  return threads;
}

function toggleLikeThread(id) {
  const threads = getThreads().map(t => {
    if (t.id === id) {
      return { ...t, isLiked: !t.isLiked, likes: t.isLiked ? t.likes - 1 : t.likes + 1 };
    }
    return t;
  });
  setStorage(THREADS_KEY, threads);
  return threads;
}

// Activities
function getActivities() {
  return getStorage(ACTIVITIES_KEY, []);
}

function addActivity(activity) {
  const activities = getActivities();
  const newActivity = {
    ...activity,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    participants: 1,
    joined: true
  };
  activities.unshift(newActivity);
  setStorage(ACTIVITIES_KEY, activities);
  return newActivity;
}

function joinActivity(id) {
  const activities = getActivities().map(a =>
    a.id === id && !a.joined
      ? { ...a, participants: a.participants + 1, joined: true }
      : a
  );
  setStorage(ACTIVITIES_KEY, activities);
  return activities;
}

function leaveActivity(id) {
  const activities = getActivities().map(a =>
    a.id === id && a.joined
      ? { ...a, participants: Math.max(0, a.participants - 1), joined: false }
      : a
  );
  setStorage(ACTIVITIES_KEY, activities);
  return activities;
}

// Game
function getGameSession() {
  return getStorage(GAME_KEY, DEFAULT_GAME);
}

function setGameSession(updates) {
  const current = getGameSession();
  const next = { ...current, ...updates };
  setStorage(GAME_KEY, next);
  return next;
}

function addToHistory(cardId) {
  const session = getGameSession();
  const history = [...session.history.filter(id => id !== cardId), cardId];
  const next = { ...session, history };
  setStorage(GAME_KEY, next);
  return next;
}

function toggleFavorite(cardId) {
  const session = getGameSession();
  const favorites = session.favorites.includes(cardId)
    ? session.favorites.filter(id => id !== cardId)
    : [...session.favorites, cardId];
  const next = { ...session, favorites };
  setStorage(GAME_KEY, next);
  return next;
}

function resetHistory() {
  const session = getGameSession();
  const next = { ...session, history: [] };
  setStorage(GAME_KEY, next);
  return next;
}

module.exports = {
  getProfile, setProfile, isProfileSetup,
  getThreads, addThread, toggleLikeThread,
  getActivities, addActivity, joinActivity, leaveActivity,
  getGameSession, setGameSession, addToHistory, toggleFavorite, resetHistory
};
