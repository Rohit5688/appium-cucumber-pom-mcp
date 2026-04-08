import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { ExecutionService } from '../services/ExecutionService.js';

/**
 * Issue #15 Test Suite: inspect_ui_hierarchy Invalid Selector Strategy Fix
 *
 * TASK-01 UPDATE: inspectHierarchy now returns a compact `snapshot` string and
 * `elementCount` instead of raw `xml` + `elements[]`.
 * Tests have been updated to assert on the snapshot text and elementCount shape.
 */
describe('ExecutionService - Issue #15: Valid Locator Strategies', () => {

  it('should generate snapshot containing accessibility-id selector with ~ prefix', async () => {
    const executionService = new ExecutionService();
    const xml = `<android.widget.Button content-desc="Submit Button" text="Submit" bounds="[0,0][100,50]" />`;

    const result = await executionService.inspectHierarchy('<test>', xml, '');

    assert.ok(typeof result.snapshot === 'string', 'snapshot should be a string');
    assert.ok(result.snapshot.length > 0, 'snapshot should not be empty');

    // Accessibility-id selector should appear in the snapshot
    assert.ok(result.snapshot.includes('~Submit Button'),
      'Snapshot should include accessibility-id selector');

    // Should NOT contain invalid *[text()="..."] format
    assert.ok(!result.snapshot.includes('*[text()='),
      'Snapshot should NOT contain invalid *[text()= format');
  });

  it('should generate snapshot containing resource-id selector with id= prefix', async () => {
    const executionService = new ExecutionService();
    const xml = `<android.widget.Button resource-id="com.app:id/submitBtn" text="Submit" bounds="[0,0][100,50]" />`;

    const result = await executionService.inspectHierarchy('<test>', xml, '');

    assert.ok(result.snapshot.includes('id=com.app:id/submitBtn'),
      'Snapshot should include resource-id selector');

    // Should NOT contain invalid selector format
    assert.ok(!result.snapshot.includes('*['),
      'Snapshot should NOT contain selectors starting with *[');
  });

  it('should generate snapshot containing valid XPath selector for text attribute', async () => {
    const executionService = new ExecutionService();
    const xml = `<android.widget.TextView text="Login" bounds="[0,0][100,50]" />`;

    const result = await executionService.inspectHierarchy('<test>', xml, '');

    // Should generate valid XPath: //*[@text="Login"]
    assert.ok(result.snapshot.includes('//*[@text="Login"]'),
      'Snapshot should include valid XPath with @text attribute');

    // Should NOT generate invalid *[text()="Login"]
    assert.ok(!result.snapshot.includes('*[text()="Login"]'),
      'Snapshot should NOT include invalid *[text()= format');
  });

  it('should escape double quotes in text for valid XPath', async () => {
    const executionService = new ExecutionService();
    const xml = `<android.widget.TextView text='He said "Hello"' bounds="[0,0][100,50]" />`;

    const result = await executionService.inspectHierarchy('<test>', xml, '');

    // Should properly escape quotes in XPath
    assert.ok(result.snapshot.includes('//*[@text="He said &quot;Hello&quot;"]'),
      'Snapshot should escape double quotes in XPath');
  });

  it('should prioritize selectors in correct stability order (accessibility-id first)', async () => {
    const executionService = new ExecutionService();
    const xml = `
      <android.widget.Button 
        content-desc="Submit" 
        resource-id="com.app:id/submitBtn" 
        text="Submit Form" 
        class="android.widget.Button"
        bounds="[0,0][100,50]" 
      />
    `;

    const result = await executionService.inspectHierarchy('<test>', xml, '');

    assert.ok(result.snapshot.length > 0, 'Should have snapshot content');

    // Accessibility ID (~Submit) should appear in the snapshot before resource-id
    const accessIdx = result.snapshot.indexOf('~Submit');
    const resIdx = result.snapshot.indexOf('id=com.app:id/submitBtn');

    assert.ok(accessIdx !== -1, 'Accessibility-id selector should be in snapshot');
    // The best locator is shown first on the row — accessibility-id takes col priority
    assert.ok(accessIdx < resIdx || resIdx === -1,
      'Accessibility ID should appear before resource-id in snapshot');
  });

  it('should not generate selectors for invalid text (too long)', async () => {
    const executionService = new ExecutionService();
    const longText = 'A'.repeat(100); // 100 characters
    const xml = `<android.widget.TextView text="${longText}" resource-id="com.app:id/longText" bounds="[0,0][100,50]" />`;

    const result = await executionService.inspectHierarchy('<test>', xml, '');

    // Resource-id should be in snapshot
    assert.ok(result.snapshot.includes('id=com.app:id/longText'),
      'Snapshot should include resource-id');

    // Long text XPath should NOT be present
    assert.ok(!result.snapshot.includes(`@text="${longText}"`),
      'Snapshot should NOT include text-based XPath for long text');
  });

  it('should handle iOS elements with name attribute', async () => {
    const executionService = new ExecutionService();
    const xml = `<XCUIElementTypeButton name="loginButton" label="Login" bounds="[0,0][100,50]" />`;

    const result = await executionService.inspectHierarchy('<test>', xml, '');

    // iOS uses name for accessibility
    assert.ok(result.snapshot.includes('~loginButton'),
      'Snapshot should use name attribute for accessibility-id on iOS');
  });

  it('should generate class-based XPath as last resort', async () => {
    const executionService = new ExecutionService();
    const xml = `<android.widget.Button class="android.widget.Button" bounds="[0,0][100,50]" />`;

    const result = await executionService.inspectHierarchy('<test>', xml, '');

    // When no better option, class-based selector appears in snapshot
    assert.ok(result.snapshot.includes('//android.widget.Button'),
      'Snapshot should use class-based XPath as last resort');
  });

  it('regression test: should never generate invalid *[attribute] selectors', async () => {
    const executionService = new ExecutionService();
    // This is the exact scenario from Issue #15 that was failing
    const xml = `<android.widget.Button text="Submit" bounds="[0,0][100,50]" />`;

    const result = await executionService.inspectHierarchy('<test>', xml, '');

    // CRITICAL: Should NOT contain *[text()="Submit"]
    assert.ok(!result.snapshot.includes('*[text()='),
      'CRITICAL: Snapshot should NOT contain invalid *[text()= selectors');

    // Should contain VALID XPath instead
    assert.ok(result.snapshot.includes('//*[@text="Submit"]'),
      'Snapshot should contain valid XPath //*[@text="Submit"] instead');
  });

  it('should return elementCount metadata', async () => {
    const executionService = new ExecutionService();
    const xml = `
      <android.widget.Button 
        content-desc="Submit" 
        resource-id="com.app:id/submitBtn" 
        text="Submit" 
        class="android.widget.Button"
        bounds="[0,0][100,50]" 
      />
    `;

    const result = await executionService.inspectHierarchy('<test>', xml, '');

    // Should include elementCount metadata
    assert.ok(result.elementCount !== undefined, 'Should have elementCount');
    assert.ok(typeof result.elementCount.total === 'number', 'total should be a number');
    assert.ok(typeof result.elementCount.interactive === 'number', 'interactive should be a number');
    assert.ok(result.elementCount.total >= 1, 'Should have at least one element');
  });

  it('should only return raw xml when includeRawXml is explicitly passed', async () => {
    const executionService = new ExecutionService();
    const xmlDump = `<android.widget.Button content-desc="Submit" bounds="[0,0][100,50]" />`;

    // When includeRawXml IS passed → rawXml should be populated
    const resultWithXml = await executionService.inspectHierarchy('<test>', xmlDump, '', undefined, true);
    assert.ok(resultWithXml.rawXml !== undefined, 'rawXml should be populated when includeRawXml is passed');

    // When xmlDump is NOT passed (would require a live session — skip session path here)
    // This is covered by integration tests with a live Appium session
  });

  it('should include source and timestamp in result', async () => {
    const executionService = new ExecutionService();
    const xml = `<android.widget.Button content-desc="Submit" bounds="[0,0][100,50]" />`;

    const result = await executionService.inspectHierarchy('<test>', xml, '');

    assert.ok(result.source === 'provided', 'source should be "provided" when xmlDump is passed');
    assert.ok(typeof result.timestamp === 'string', 'timestamp should be a string');
    assert.ok(result.timestamp.length > 0, 'timestamp should not be empty');
  });
});