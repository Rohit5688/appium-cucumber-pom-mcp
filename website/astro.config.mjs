import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const site = 'https://rohit5688.github.io';
const base = '/AppForge';

export default defineConfig({
	site,
	base,
	trailingSlash: 'always',
	integrations: [
		starlight({
			favicon: '/favicon.png',
			title: 'AppForge',
			customCss: ['./src/styles/custom.css'],
			logo: {
				src: './src/assets/logo.png',
			},
			social: {
				github: 'https://github.com/ForgeTest-AI/AppForge',
			},
			editLink: {
				baseUrl: undefined,
			},
			sidebar: [
				{
					label: '🚀 Getting Started',
					items: [
						{ label: '🛠️ Installation & MCP Setup', link: 'repo/user/installation' },
						{ label: '⏱️ 5-Minute Quickstart', link: 'repo/user/quickstart' },
						{ label: '⚙️ Setup & Configuration', link: 'repo/user/setup_and_configuration' },
						{ label: '🔧 Troubleshooting', link: 'repo/user/troubleshooting' },
					],
				},
				{
					label: '📖 User Guides',
					items: [
						{ label: 'Master Guide', link: 'repo/user/userguide' },
						{ label: '📋 Prompt Cheatbook', link: 'repo/user/promptcheatbook' },
						{ label: '🔄 Core Workflows', link: 'repo/user/workflows' },
						{ label: '🚀 Worked Examples', link: 'repo/user/workedexamples' },
					],
				},
				{
					label: '🛠️ Platform Core',
					collapsed: true,
					items: [
						{ label: 'Test Generation', link: 'repo/technical/testgeneration' },
						{ label: 'Execution & Healing', link: 'repo/technical/executionandhealing' },
						{ label: 'Token Optimization', link: 'repo/technical/tokenoptimizer' },
					],
				},
				{
					label: '📐 Architecture',
					collapsed: true,
					items: [
						{ label: 'System Architecture', link: 'repo/technical/architecture' },
						{ label: 'Agent Protocol', link: 'repo/technical/agentprotocol' },
						{ label: 'MCP Config Reference', link: 'repo/technical/mcp_config_reference' },
						{ label: 'Security & Compliance', link: 'repo/technical/securityandcompliance' },
					],
				},
				{
					label: '📚 API Reference',
					collapsed: true,
					items: [
						{ label: 'Master Tool Reference', link: 'api/toolreference' },
					],
				},
				{
					label: '📈 Infrastructure & Ops',
					collapsed: true,
					items: [
						{ label: 'Continuous Integration', link: 'repo/maintenance/continuousintegration' },
						{ label: 'Project Evolution', link: 'repo/maintenance/projectevolution' },
						{ label: 'Containerization (Docker)', link: 'repo/maintenance/dockersetup' },
						{ label: 'Observability & Logging', link: 'repo/maintenance/observabilityandlogging' },
						{ label: 'Migration Guide', link: 'repo/maintenance/migrationguide' },
						{ label: 'Team Collaboration', link: 'repo/maintenance/teamcollaboration' },
					],
				},
				{
					label: '🤝 Community & Help',
					collapsed: true,
					items: [
						{ label: 'Community Support', link: 'repo/user/community' },
						{ label: 'Frequently Asked Questions', link: 'repo/user/faq' },
						{ label: 'What\'s New', link: 'repo/user/whatsnew' },
					],
				},
			],
		}),
		{
			name: 'sitemap-killer',
			hooks: {
				'astro:config:setup': ({ config }) => {
					// Surgically remove sitemap if starlight injected it
					const sitemapIdx = config.integrations.findIndex(i => i.name === '@astrojs/sitemap');
					if (sitemapIdx !== -1) {
						config.integrations.splice(sitemapIdx, 1);
					}
				}
			}
		}
	],
});
