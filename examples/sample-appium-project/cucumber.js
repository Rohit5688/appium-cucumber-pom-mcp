// cucumber.js — Cucumber configuration
export default {
  requireModule: ['ts-node/register'],
  require: ['step-definitions/**/*.ts'],
  format: [
    'progress-bar',
    'json:reports/cucumber-report.json',
    'html:reports/cucumber-report.html'
  ],
  paths: ['features/**/*.feature'],
  publishQuiet: true
};
