// https://astro.build/config
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://rohit5688.github.io',
	base: '/appium-cucumber-pom-mcp',
	integrations: [
		starlight({
			favicon: '/favicon.png',
			title: 'AppForge',
			logo: {
				src: './src/assets/logo.png',
			},
			social: {
				// github: 'https://github.com/Rohit5688/appium-cucumber-pom-mcp',
			},
			editLink: {
				baseUrl: undefined,
			},
			sidebar: [
				{
					label: '🚀 Getting Started',
					items: [
						{ label: 'User Guide', link: 'repo/userguide' },
						{ label: 'Onboarding', link: 'repo/onboarding' },
						{ label: 'Installation', link: 'repo/dockersetup' },
						{ label: 'E2E Testing Guide', link: 'repo/e2etestingguide' },
					],
				},
				{
					label: '🏛️ Architecture',
					items: [
						{ label: 'System Architecture', link: 'repo/architecture' },
						{ label: 'Project Evolution', link: 'repo/projectevolution' },
						{ label: 'Workflows', link: 'repo/workflows' },
						{ label: 'Execution & Healing', link: 'repo/executionandhealing' },
					],
				},
				{
					label: '⚙️ Configuration & Reference',
					items: [
						{ label: 'MCP Config', link: 'repo/mcpconfig' },
						{ label: 'Config Reference', link: 'repo/mcp_config_reference' },
						{ label: 'Path Configuration', link: 'repo/path_configuration_explained' },
						{ label: 'Tool Standards', link: 'repo/tool_description_standard' },
					],
				},
				{
					label: '🛡️ Security & Compliance',
					items: [
						{ label: 'Security Overview', link: 'repo/security' },
						{ label: 'Compliance Audit', link: 'repo/security_compliance' },
						{ label: 'Sandbox Security', link: 'repo/sandbox_security_model' },
						{ label: 'Risk Matrix', link: 'repo/sandbox_api_risk_matrix' },
					],
				},
				{
					label: '📊 Operations',
					items: [
						{ label: 'Continuous Integration', link: 'repo/continuousintegration' },
						{ label: 'Observability & Logging', link: 'repo/observabilityandlogging' },
						{ label: 'Appium & WDIO v9', link: 'repo/wdio_v9_run_and_fixes' },
						{ label: 'Migration Guide', link: 'repo/migrationguide' },
					],
				},
				{
					label: '🤖 AI Strategy',
					items: [
						{ label: 'Prompt Cheatbook', link: 'repo/appforge_prompt_cheatbook' },
						{ label: 'Token Optimization', link: 'repo/tokenoptimizer' },
						{ label: 'Agent Guide', link: 'repo/agent_token_optimization_guide' },
						{ label: 'Knowledge Map', link: 'repo/issues' },
					],
				},
			],
		}),
	],
});

