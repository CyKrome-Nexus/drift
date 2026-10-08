// The iOS template runs React Native's bundle script as
//   `"$NODE_BINARY" --print "…/react-native-xcode.sh"`
// unquoted, so a project path with a space (like this repo's checkout) is split into words and
// the build fails. Quote the substitution. EAS checkouts have no spaces; local builds need this.
const { withXcodeProject } = require('expo/config-plugins');

// As stored in project.pbxproj: the script text is escaped (\" for ").
const UNQUOTED = /`(\\"\$NODE_BINARY\\" --print \\"[^`]*react-native-xcode\.sh'\\")`/;

module.exports = function withSpaceSafeBundlePhase(config) {
  return withXcodeProject(config, (cfg) => {
    const phases = cfg.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {};
    for (const phase of Object.values(phases)) {
      if (typeof phase === 'object' && typeof phase.shellScript === 'string') {
        phase.shellScript = phase.shellScript.replace(UNQUOTED, '\\"$($1)\\"');
      }
    }
    return cfg;
  });
};
