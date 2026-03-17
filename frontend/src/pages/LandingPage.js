import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Tag, Bot, TrendingUp, GitBranch, Layers, ArrowRight, Cpu } from 'lucide-react';

function FeatureCard({ icon: Icon, title, description, color }) {
  return (
    <div className="bg-gray-800 rounded-xl p-6">
      <div className={`inline-flex p-3 rounded-lg ${color} mb-4`}>
        <Icon size={24} className="text-white" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function StepCard({ step, title, description }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
        {step}
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
        <p className="text-gray-400 text-sm">{description}</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Prompt Manager</h1>
          <p className="text-xs text-gray-400">v1.0.0</p>
        </div>
        <Link
          to="/dashboard"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Go to Dashboard <ArrowRight size={16} />
        </Link>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center">
        <h2 className="text-4xl font-bold text-white mb-4">
          Manage Your AI Prompts with Confidence
        </h2>
        <p className="text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
          A production-ready framework for managing AI prompts across agents and organizations —
          with version control, quality metrics, and composability.
        </p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-colors text-lg"
        >
          Get Started <ArrowRight size={20} />
        </Link>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-white mb-8 text-center">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <FeatureCard
            icon={FileText}
            title="Prompt Management"
            description="Create, organize, and manage all your AI prompts in one place. Search, filter by tags or agents, and access the full version history."
            color="bg-blue-600"
          />
          <FeatureCard
            icon={GitBranch}
            title="Version Control"
            description="Full version history with parent-child relationships and semantic versioning. Easily create new versions and track changes over time."
            color="bg-purple-600"
          />
          <FeatureCard
            icon={Tag}
            title="Tags"
            description="Organize prompts with color-coded tags. Filter, bulk-assign, and quickly find prompts by category."
            color="bg-pink-600"
          />
          <FeatureCard
            icon={Bot}
            title="Agent Management"
            description="Define AI agents, associate prompts with them, track usage, and manage their status across your organization."
            color="bg-green-600"
          />
          <FeatureCard
            icon={Layers}
            title="Composable Prompts"
            description="Reference other prompts as reusable components using {{component:id}} syntax to build complex prompts from smaller parts."
            color="bg-yellow-600"
          />
          <FeatureCard
            icon={TrendingUp}
            title="Quality Metrics"
            description="Track ratings, success rate, usage count, execution time, token count, and cost to measure and improve prompt quality."
            color="bg-orange-600"
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-3xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-white mb-8 text-center">How It Works</h2>
        <div className="space-y-8">
          <StepCard
            step="1"
            title="Create Prompts"
            description="Write your AI prompts with support for variables ({{variable_name}}) and component references. Add tags and descriptions to keep them organized."
          />
          <StepCard
            step="2"
            title="Organize & Tag"
            description="Assign color-coded tags to prompts and associate them with specific AI agents. Use filters to quickly find the right prompt."
          />
          <StepCard
            step="3"
            title="Render & Execute"
            description="Render prompts with dynamic variable substitution and track each execution. The system automatically resolves component references."
          />
          <StepCard
            step="4"
            title="Monitor Quality"
            description="Review ratings, success rates, and usage statistics in the dashboard to continuously improve your prompts."
          />
        </div>
      </section>

      {/* MCP / AI Agent Connectivity */}
      <section className="max-w-4xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-bold text-white mb-2 text-center">Connect AI Agents via MCP</h2>
        <p className="text-gray-400 text-center mb-8 text-sm">
          The built-in <a href="https://modelcontextprotocol.io/" target="_blank" rel="noopener noreferrer" className="text-teal-400 hover:underline">Model Context Protocol</a> server at <code className="bg-gray-800 text-teal-300 px-1 rounded"><a href="/mcp" target="_blank" rel="noopener noreferrer">/mcp</a></code> exposes all prompt tools so coding assistants can use them directly.
        </p>
        <p className="text-gray-400 text-center mb-8 text-sm">
          The below examples are based on a local MCP server running from the docker images on <code className="bg-gray-800 text-teal-300 px-1 rounded">http://localhost/mcp</code>.
          </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* VS Code */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-3">VS Code (GitHub Copilot)</h3>
            <p className="text-gray-400 text-sm mb-4">Add this to <code className="bg-gray-700 px-1 rounded">.vscode/mcp.json</code> in your project:</p>
            <pre className="bg-gray-900 rounded-lg p-4 text-sm text-teal-300 overflow-x-auto">{`{
  "servers": {
    "open-prompt-manager": {
      "type": "http",
      "url": "http://localhost/mcp"
    }
  }
}`}</pre>
            <p className="text-gray-500 text-xs mt-3">Open the Chat panel → Agent mode, and your prompts are available as context tools.</p>
          </div>
          {/* Claude Code */}
          <div className="bg-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-white mb-3">Claude Code</h3>
            <p className="text-gray-400 text-sm mb-4">Register the server with one command:</p>
            <pre className="bg-gray-900 rounded-lg p-4 text-sm text-teal-300 overflow-x-auto">{`claude mcp add \\
  --transport http \\
  open-prompt-manager \\
  http://localhost/mcp`}</pre>
            <p className="text-gray-500 text-xs mt-3">Verify with <code className="bg-gray-700 px-1 rounded">claude mcp list</code>. All tools become available in every Claude Code session.</p>
          </div>
        </div>
        <div className="mt-6 bg-gray-800 rounded-xl p-5">
          <h3 className="text-base font-semibold text-white mb-3">Available MCP Tools</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-sm">
            {['list_prompts', 'get_prompt', 'render_prompt', 'create_prompt', 'list_tags', 'create_tag', 'list_agents'].map(tool => (
              <span key={tool} className="bg-gray-900 text-teal-300 rounded px-2 py-1 font-mono text-xs">{tool}</span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Ready to get started?</h2>
        <p className="text-gray-400 mb-8">Access the dashboard to start managing your AI prompts.</p>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          Open Dashboard <ArrowRight size={20} />
        </Link>
      </section>
    </div>
  );
}
