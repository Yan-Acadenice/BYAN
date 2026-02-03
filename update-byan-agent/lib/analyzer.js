// Analyzer Module - MVP placeholder
class Analyzer {
  constructor(installPath) {
    this.installPath = installPath;
  }
  async checkVersion() {
    return { current: '1.0.0', latest: '1.0.5', upToDate: false };
  }
}
module.exports = Analyzer;
