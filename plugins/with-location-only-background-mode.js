const { withInfoPlist } = require('expo/config-plugins');

/**
 * Konjo uses TaskManager only to deliver expo-location updates. Expo's generic
 * TaskManager plugin adds the `fetch` background mode even though Konjo does
 * not schedule background-fetch work. Keep only background modes that match
 * features the release actually performs.
 */
module.exports = function withLocationOnlyBackgroundMode(config) {
  return withInfoPlist(config, (next) => {
    const modes = Array.isArray(next.modResults.UIBackgroundModes)
      ? next.modResults.UIBackgroundModes
      : [];

    next.modResults.UIBackgroundModes = [
      ...new Set(modes.filter((mode) => mode !== 'fetch').concat('location')),
    ];

    return next;
  });
};
