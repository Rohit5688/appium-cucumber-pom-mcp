import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// const site = 'https://rohit5688.github.io';
const base = '/AppForge';

export default defineConfig({
	// site,
	base,
	integrations: [
		starlight({
			favicon: '/favicon.png',
			title: 'AppForge',
			customCss: ['./src/styles/custom.css'],
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
						{ label: 'Test Generation', link: 'repo/testgeneration' },
					],
				},
				{
					label: '🏛️ Architecture',
					items: [
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
					],
				},
				{
					label: '🛡️ Security & Compliance',
					items: [
						{ label: 'Security Overview', link: 'repo/security' },
					],
				},
				{
					label: '📊 Operations',
					items: [
						{ label: 'Continuous Integration', link: 'repo/continuousintegration' },
						{ label: 'Observability & Logging', link: 'repo/observabilityandlogging' },
						{ label: 'Migration Guide', link: 'repo/migrationguide' },
						{ label: 'Team Collaboration', link: 'repo/teamcollaboration' },
					],
				},
				{
					label: '🤖 AI Strategy',
					items: [
						{ label: 'Prompt Cheatbook', link: 'repo/appforge_prompt_cheatbook' },
					],
				},
			],
		}),
		// We use a dummy integration here to "squat" on the name '@astrojs/sitemap' 
		// if starlight tries to inject it, or just ensure it's not present.
	].filter(i => i && i.name !== '@astrojs/sitemap'),
});

