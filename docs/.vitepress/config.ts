import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
  defineConfig({
    title: 'brightspace-mcp',
    description: 'MCP server for D2L Brightspace — multi-auth, opt-in writes, session cache',
    lang: 'en-US',
    base: '/brightspace-mcp/',
    cleanUrls: true,
    lastUpdated: true,
    ignoreDeadLinks: [
      /^\.\.\/AGENTS\.md$/,
      /^\.\.\/CHANGELOG\.md$/,
      /^\.\.\/README\.md$/,
    ],
    srcExclude: ['README.md', 'superpowers/**', 'plans/**', '_internal/**', '_brainstorms/**'],
    head: [
      ['meta', { name: 'theme-color', content: '#3eaf7c' }],
      ['meta', { property: 'og:title', content: 'brightspace-mcp' }],
      ['meta', { property: 'og:description', content: 'MCP server for D2L Brightspace LMS' }],
      ['meta', { property: 'og:type', content: 'website' }],
    ],
    themeConfig: {
      nav: [
        { text: 'Setup', link: '/setup-guide' },
        { text: 'Tools', link: '/tools' },
        { text: 'Architecture', link: '/architecture' },
        {
          text: 'Reference',
          items: [
            { text: 'Auth strategies', link: '/auth-strategies' },
            { text: 'Presets', link: '/presets' },
            { text: 'Writes', link: '/writes' },
            { text: 'Troubleshooting', link: '/troubleshooting' },
            { text: 'Clients', link: '/clients' },
          ],
        },
        {
          text: 'v1.1.0',
          items: [
            { text: 'Changelog', link: 'https://github.com/JhostinAleck/brightspace-mcp/blob/main/CHANGELOG.md' },
            { text: 'Releases', link: 'https://github.com/JhostinAleck/brightspace-mcp/releases' },
          ],
        },
      ],
      sidebar: [
        {
          text: 'Getting started',
          collapsed: false,
          items: [
            { text: 'Overview', link: '/' },
            { text: 'Setup guide', link: '/setup-guide' },
            { text: 'Auth strategies', link: '/auth-strategies' },
            { text: 'Presets', link: '/presets' },
            { text: 'MCP clients', link: '/clients' },
          ],
        },
        {
          text: 'Capabilities',
          collapsed: false,
          items: [
            { text: 'Tools (read)', link: '/tools' },
            { text: 'Writes (gated)', link: '/writes' },
          ],
        },
        {
          text: 'Operations',
          collapsed: false,
          items: [
            { text: 'Troubleshooting', link: '/troubleshooting' },
            { text: 'Architecture', link: '/architecture' },
          ],
        },
      ],
      socialLinks: [
        { icon: 'github', link: 'https://github.com/JhostinAleck/brightspace-mcp' },
      ],
      search: { provider: 'local' },
      editLink: {
        pattern: 'https://github.com/JhostinAleck/brightspace-mcp/edit/main/docs/:path',
        text: 'Edit this page on GitHub',
      },
      footer: {
        message: 'Released under the MIT License.',
        copyright: '© 2026 Jhostin Aleck Sánchez',
      },
      outline: { level: [2, 3], label: 'On this page' },
    },
    mermaid: {
      theme: 'default',
    },
  }),
);
