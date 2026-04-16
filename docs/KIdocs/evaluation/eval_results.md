# AppForge Deterministic Evaluation Report

## Summary

- **Accuracy**: 40/40 (100.0%)
- **Mode**: Deterministic (Code-based)
- **Status**: PASS

## Details

### Task 1: ✅
**Question**: Which tool should be called FIRST according to workflow_guide when you don't know which tool to use or how to start?
**Expected**: `workflow_guide`
**Actual**: `workflow_guide`

### Task 2: ✅
**Question**: Call workflow_guide with workflow="new_project". What is the FIRST tool it recommends calling in that workflow?
**Expected**: `check_environment`
**Actual**: `check_environment`

### Task 3: ✅
**Question**: Call workflow_guide with workflow="write_test". How many steps does that workflow contain?
**Expected**: `6`
**Actual**: `6`

### Task 4: ✅
**Question**: Call workflow_guide with workflow="run_and_heal". Which tool does it recommend calling AFTER verify_selector confirms a selector works?
**Expected**: `train_on_example`
**Actual**: `train_on_example`

### Task 5: ✅
**Question**: What is the default platform value used by setup_project when no platform argument is provided?
**Expected**: `android`
**Actual**: `android`

### Task 6: ✅
**Question**: What does verify_selector return in the "note" field when it successfully auto-learns a healed selector (when an oldSelector is provided during verification)?
**Expected**: `Selector verified and heal automatically learned.`
**Actual**: `Selector verified and heal automatically learned.`

### Task 7: ✅
**Question**: According to the execute_sandbox_code tool description (Turbo Mode), what is the correct way to return a value from a sandbox script?
**Expected**: `use `return <value>` in your script`
**Actual**: `use `return <value>` in your script`

### Task 8: ✅
**Question**: What file does train_on_example store learned rules in?
**Expected**: `.AppForge/mcp-learning.json`
**Actual**: `.AppForge/mcp-learning.json`

### Task 9: ✅
**Question**: What parameter should be set to true in the validate_and_write tool to perform validation without writing files to disk?
**Expected**: `preview`
**Actual**: `preview`

### Task 10: ✅
**Question**: Which manage_config operation is used to update the app path for a specific platform in the project configuration?
**Expected**: `inject_app`
**Actual**: `inject_app`

### Task 11: ✅
**Question**: Does the inspect_ui_hierarchy tool support an 'xmlDump' parameter for offline parsing?
**Expected**: `yes`
**Actual**: `yes`

### Task 12: ✅
**Question**: In run_cucumber_test, what is the default value for the 'runAsync' parameter?
**Expected**: `true`
**Actual**: `true`

### Task 13: ✅
**Question**: Is 'jobId' a required parameter for the check_test_status tool?
**Expected**: `yes`
**Actual**: `yes`

### Task 14: ✅
**Question**: Which parameter is required for self_heal_test to analyze a failure?
**Expected**: `testOutput`
**Actual**: `testOutput`

### Task 15: ✅
**Question**: Is 'testDescription' a required parameter for generate_cucumber_pom?
**Expected**: `yes`
**Actual**: `yes`

### Task 16: ✅
**Question**: Does the upgrade_project tool support a 'preview' mode?
**Expected**: `yes`
**Actual**: `yes`

### Task 17: ✅
**Question**: Which manage_users operations are supported in the 'operation' enum?
**Expected**: `read, write`
**Actual**: `read, write`

### Task 18: ✅
**Question**: What tool should be used to check the estimated token usage for the current session?
**Expected**: `get_token_budget`
**Actual**: `get_token_budget`

### Task 19: ✅
**Question**: Does export_navigation_map support a 'forceRebuild' parameter?
**Expected**: `yes`
**Actual**: `yes`

### Task 20: ✅
**Question**: Is 'projectRoot' a required parameter for audit_mobile_locators?
**Expected**: `yes`
**Actual**: `yes`

### Task 21: ✅
**Question**: Does generate_ci_workflow support both 'github' and 'gitlab' as providers?
**Expected**: `github, gitlab`
**Actual**: `github, gitlab`

### Task 22: ✅
**Question**: Is 'entityName' a required property for generate_test_data_factory?
**Expected**: `yes`
**Actual**: `yes`

### Task 23: ✅
**Question**: Which parameter in audit_utils allows specifying a custom Appium wrapper package?
**Expected**: `customWrapperPackage`
**Actual**: `customWrapperPackage`

### Task 24: ✅
**Question**: Does check_appium_ready have a property for 'appiumUrl' in its schema?
**Expected**: `yes`
**Actual**: `yes`

### Task 25: ✅
**Question**: Does extract_navigation_map allow toggling 'includeCommonFlows'?
**Expected**: `yes`
**Actual**: `yes`

### Task 26: ✅
**Question**: Which frameworks are supported by migrate_test in its sourceFramework enum?
**Expected**: `espresso, xcuitest, detox`
**Actual**: `espresso, xcuitest, detox`

### Task 27: ✅
**Question**: Does repair_project support 'both' as a target platform?
**Expected**: `yes`
**Actual**: `yes`

### Task 28: ✅
**Question**: Which tool should be used to find duplicate step definitions or unused Page Object methods?
**Expected**: `suggest_refactorings`
**Actual**: `suggest_refactorings`

### Task 29: ✅
**Question**: Is 'projectRoot' listed as a required parameter for export_team_knowledge?
**Expected**: `yes`
**Actual**: `yes`

### Task 30: ✅
**Question**: Which tool provides memory, uptime, and singleton pool metrics for the Appium session?
**Expected**: `get_session_health`
**Actual**: `get_session_health`

### Task 31: ✅
**Question**: What error keyword is returned if run_cucumber_test is called without the required 'projectRoot'?
**Expected**: `invalid_type`
**Actual**: `invalid_type`

### Task 32: ✅
**Question**: What error keyword is returned if manage_config is called with an invalid operation like 'delete_all'?
**Expected**: `invalid_value`
**Actual**: `invalid_value`

### Task 33: ✅
**Question**: What happens if check_test_status is called with 'waitSeconds' set to 100 (exceeding max 55)?
**Expected**: `too_big`
**Actual**: `too_big`

### Task 34: ✅
**Question**: What error occurs if start_appium_session is called with a number instead of a string for 'projectRoot'?
**Expected**: `invalid_type`
**Actual**: `invalid_type`

### Task 35: ✅
**Question**: Is an error returned if self_heal_test is called with an empty 'testOutput' string?
**Expected**: `required`
**Actual**: `required`

### Task 36: ✅
**Question**: What error is returned if create_test_atomically is called with a file missing the 'content' field?
**Expected**: `invalid_type`
**Actual**: `invalid_type`

### Task 37: ✅
**Question**: Does setup_project reject a 'platform' value of 'windows' via its enum constraint?
**Expected**: `invalid_value`
**Actual**: `invalid_value`

### Task 38: ✅
**Question**: Does manage_users require a 'projectRoot' to function?
**Expected**: `invalid_type`
**Actual**: `invalid_type`

### Task 39: ✅
**Question**: What error keyword is returned if upgrade_project receives a boolean instead of a string for 'projectRoot'?
**Expected**: `invalid_type`
**Actual**: `invalid_type`

### Task 40: ✅
**Question**: Does repair_project throw a 'required' error if no projectRoot is provided?
**Expected**: `invalid_type`
**Actual**: `invalid_type`

