import React, { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Code2, ArrowRight } from 'lucide-react';

// ── Helper components ────────────────────────────────────────────────────────

function MethodBadge({ method }) {
  const colors = {
    GET: 'bg-blue-600',
    POST: 'bg-green-600',
    PUT: 'bg-yellow-600',
    DELETE: 'bg-red-600',
    PATCH: 'bg-purple-600',
  };
  return (
    <span className={`${colors[method] || 'bg-gray-600'} text-white text-xs font-bold px-2 py-0.5 rounded`}>
      {method}
    </span>
  );
}

function StatusBadge({ code }) {
  const colors = {
    200: 'bg-blue-700 text-blue-100',
    201: 'bg-green-700 text-green-100',
    204: 'bg-gray-600 text-gray-100',
    400: 'bg-yellow-700 text-yellow-100',
    404: 'bg-orange-700 text-orange-100',
    409: 'bg-red-700 text-red-100',
    422: 'bg-red-700 text-red-100',
  };
  return (
    <span className={`${colors[code] || 'bg-gray-600 text-gray-100'} text-xs font-mono px-1.5 py-0.5 rounded`}>
      {code}
    </span>
  );
}

function CodeBlock({ children, language = 'json' }) {
  return (
    <pre className="bg-gray-950 text-green-300 text-xs rounded-lg p-4 overflow-x-auto border border-gray-700">
      <code className={`language-${language}`}>{children}</code>
    </pre>
  );
}

function Section({ title, id, children }) {
  return (
    <section id={id} className="mb-12">
      <h2 className="text-xl font-bold text-white mb-4 border-b border-gray-700 pb-2">{title}</h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold text-blue-300 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Endpoint({ method, path, summary, description, requestBody, responses, params }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-700 rounded-lg mb-3 overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800 hover:bg-gray-750 transition-colors text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <MethodBadge method={method} />
        <span className="font-mono text-sm text-gray-200 flex-1">{path}</span>
        <span className="text-gray-400 text-sm hidden sm:block">{summary}</span>
        {open ? <ChevronDown size={16} className="text-gray-400 shrink-0" /> : <ChevronRight size={16} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="p-4 bg-gray-900 space-y-4 border-t border-gray-700">
          {description && <p className="text-gray-300 text-sm">{description}</p>}
          {params && params.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Parameters</p>
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-gray-500">
                    <th className="pb-1 pr-4">Name</th>
                    <th className="pb-1 pr-4">In</th>
                    <th className="pb-1 pr-4">Type</th>
                    <th className="pb-1">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {params.map((p) => (
                    <tr key={p.name} className="border-t border-gray-800">
                      <td className="py-1 pr-4 font-mono text-blue-300">{p.name}{p.required && <span className="text-red-400 ml-0.5">*</span>}</td>
                      <td className="py-1 pr-4 text-gray-400">{p.in}</td>
                      <td className="py-1 pr-4 text-gray-400">{p.type}</td>
                      <td className="py-1 text-gray-300">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {requestBody && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Request Body</p>
              <CodeBlock>{requestBody}</CodeBlock>
            </div>
          )}
          {responses && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Responses</p>
              <div className="space-y-1">
                {responses.map((r) => (
                  <div key={r.status} className="flex items-center gap-2 text-sm">
                    <StatusBadge code={r.status} />
                    <span className="text-gray-300">{r.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JourneyStep({ number, title, description, code }) {
  return (
    <div className="flex gap-4 mb-6">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
        {number}
      </div>
      <div className="flex-1">
        <p className="font-semibold text-white mb-1">{title}</p>
        <p className="text-gray-400 text-sm mb-2">{description}</p>
        {code && <CodeBlock>{code}</CodeBlock>}
      </div>
    </div>
  );
}

function SchemaField({ name, type, required, description, example }) {
  return (
    <tr className="border-t border-gray-800">
      <td className="py-2 pr-4 font-mono text-blue-300 text-xs align-top">
        {name}{required && <span className="text-red-400 ml-0.5">*</span>}
      </td>
      <td className="py-2 pr-4 text-gray-400 text-xs align-top">{type}</td>
      <td className="py-2 pr-4 text-gray-300 text-xs align-top">{description}</td>
      <td className="py-2 text-gray-500 text-xs align-top font-mono">{example}</td>
    </tr>
  );
}

function SchemaTable({ fields }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm mb-4">
        <thead>
          <tr className="text-gray-500 text-xs uppercase">
            <th className="pb-2 pr-4">Field</th>
            <th className="pb-2 pr-4">Type</th>
            <th className="pb-2 pr-4">Description</th>
            <th className="pb-2">Example</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => <SchemaField key={f.name} {...f} />)}
        </tbody>
      </table>
    </div>
  );
}

// ── Data ─────────────────────────────────────────────────────────────────────

const PROMPT_FIELDS = [
  { name: 'name', type: 'string', required: true, description: 'Human-readable prompt name.', example: '"Customer Greeting"' },
  { name: 'content', type: 'string', required: true, description: 'Template text. Use {{var}} and {{component:<id>}}.', example: '"Hello, {{user_name}}!"' },
  { name: 'description', type: 'string', required: false, description: 'Short summary of the prompt purpose.', example: '"Greets new users."' },
  { name: 'version', type: 'string', required: false, description: 'Semantic version (MAJOR.MINOR.PATCH). Defaults to "1.0.0".', example: '"1.0.0"' },
  { name: 'created_by', type: 'string', required: false, description: 'Author identifier.', example: '"alice@example.com"' },
  { name: 'variables', type: 'VariableSchema[]', required: false, description: 'Typed variable definitions.', example: '[]' },
  { name: 'tag_ids', type: 'int[]', required: false, description: 'IDs of tags to attach (create only).', example: '[1, 2]' },
  { name: 'agent_ids', type: 'int[]', required: false, description: 'IDs of agents to associate (create only).', example: '[1]' },
];

const VARIABLE_FIELDS = [
  { name: 'name', type: 'string', required: true, description: 'Variable name as used in {{name}} syntax.', example: '"user_name"' },
  { name: 'type', type: 'enum', required: false, description: 'Data type: string | number | boolean | array | object', example: '"string"' },
  { name: 'required', type: 'boolean', required: false, description: 'Must be supplied at render time if true.', example: 'true' },
  { name: 'default', type: 'any', required: false, description: 'Fallback value when not supplied and not required.', example: '"World"' },
  { name: 'description', type: 'string', required: false, description: 'Human-readable description for documentation.', example: '"End-user first name."' },
];

const TAG_FIELDS = [
  { name: 'name', type: 'string', required: true, description: 'Unique tag name.', example: '"production"' },
  { name: 'color', type: 'string', required: false, description: 'Hex color for badge display. Defaults to "#3B82F6".', example: '"#10B981"' },
];

const AGENT_FIELDS = [
  { name: 'name', type: 'string', required: true, description: 'Unique agent name.', example: '"support-bot"' },
  { name: 'description', type: 'string', required: false, description: 'What the agent does.', example: '"Handles tier-1 queries."' },
  { name: 'type', type: 'string', required: false, description: 'Agent category (e.g. "chatbot", "summariser").', example: '"chatbot"' },
  { name: 'status', type: 'string', required: false, description: 'active | inactive | deprecated. Defaults to "active".', example: '"active"' },
];

const EXECUTION_FIELDS = [
  { name: 'agent_id', type: 'int', required: false, description: 'Agent that performed the execution.', example: '1' },
  { name: 'input_variables', type: 'object', required: false, description: 'Variable values used at render time.', example: '{"user_name": "Alice"}' },
  { name: 'rendered_prompt', type: 'string', required: false, description: 'Rendered text sent to the LLM.', example: '"Hello, Alice!"' },
  { name: 'response', type: 'string', required: false, description: 'Raw LLM response text.', example: '"Hi there!"' },
  { name: 'execution_time_ms', type: 'int', required: false, description: 'Wall-clock duration in ms.', example: '340' },
  { name: 'token_count', type: 'int', required: false, description: 'Total tokens consumed.', example: '64' },
  { name: 'cost', type: 'float', required: false, description: 'LLM cost in USD.', example: '0.0004' },
  { name: 'success', type: 'int', required: false, description: '1 = successful, 0 = failed. Defaults to 1.', example: '1' },
  { name: 'rating', type: 'int', required: false, description: 'Quality rating (1–5).', example: '5' },
];

const METRIC_FIELDS = [
  { name: 'metric_name', type: 'string', required: true, description: 'Metric identifier.', example: '"latency_p99"' },
  { name: 'metric_value', type: 'float', required: true, description: 'Numeric measurement.', example: '312.5' },
  { name: 'metadata', type: 'object', required: false, description: 'Optional key-value context.', example: '{"env": "prod"}' },
];

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ApiDocs() {
  const navLinks = [
    { id: 'overview', label: 'Overview' },
    { id: 'schemas', label: 'Schemas' },
    { id: 'journeys', label: 'User Journeys' },
    { id: 'prompts-api', label: 'Prompts API' },
    { id: 'tags-api', label: 'Tags API' },
    { id: 'agents-api', label: 'Agents API' },
    { id: 'health-api', label: 'Health API' },
  ];

  return (
    <div className="flex gap-8">
      {/* Sticky sidebar nav */}
      <aside className="hidden lg:block w-44 shrink-0">
        <div className="sticky top-0 pt-1">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">On this page</p>
          <nav className="space-y-1">
            {navLinks.map((l) => (
              <a
                key={l.id}
                href={`#${l.id}`}
                className="block text-sm text-gray-400 hover:text-white transition-colors py-0.5"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="mt-6 border-t border-gray-700 pt-4">
            <a
              href="/api/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
            >
              <Code2 size={12} />
              Swagger UI
            </a>
            <a
              href="/api/redoc"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1"
            >
              <BookOpen size={12} />
              ReDoc
            </a>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <BookOpen size={28} className="text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">API Documentation</h1>
            <p className="text-gray-400 text-sm">Schemas, endpoints, and integration guides</p>
          </div>
        </div>

        {/* ── Overview ── */}
        <Section title="Overview" id="overview">
          <p className="text-gray-300 text-sm mb-4">
            The Open Prompt Manager REST API lets you create, version, render, and track AI prompts
            across agents and organisations. The base URL is{' '}
            <code className="bg-gray-800 text-blue-300 px-1 rounded text-xs">/api</code> (relative to the
            backend host).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {[
              { label: 'Interactive docs', value: '/api/docs (Swagger UI)', link: '/api/docs' },
              { label: 'ReDoc reference', value: '/api/redoc', link: '/api/redoc' },
              { label: 'OpenAPI JSON', value: '/api/openapi.json', link: '/api/openapi.json' },
              { label: 'MCP endpoint', value: 'POST /mcp (Streamable HTTP)' },
            ].map((item) => (
              <div key={item.label} className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-0.5">{item.label}</p>
                {item.link ? (
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:underline font-mono">
                    {item.value}
                  </a>
                ) : (
                  <p className="text-sm text-gray-300 font-mono">{item.value}</p>
                )}
              </div>
            ))}
          </div>

          <SubSection title="Key Concepts">
            <ul className="space-y-2 text-sm text-gray-300">
              <li><span className="text-blue-300 font-semibold">Prompt</span> — A versioned template with typed variables and optional embedded component references.</li>
              <li><span className="text-blue-300 font-semibold">Version</span> — A child prompt created from a parent. <code className="bg-gray-800 text-xs px-1 rounded">is_latest: true</code> marks the current tip of each lineage.</li>
              <li><span className="text-blue-300 font-semibold">Tag</span> — A color-coded label for organising and filtering prompts.</li>
              <li><span className="text-blue-300 font-semibold">Agent</span> — An AI agent associated with prompts; its executions are aggregated into stats.</li>
              <li><span className="text-blue-300 font-semibold">Execution</span> — A record of one LLM call (cost, latency, tokens, rating).</li>
              <li><span className="text-blue-300 font-semibold">Metric</span> — A custom numeric measurement (e.g. <code className="bg-gray-800 text-xs px-1 rounded">latency_p99</code>, <code className="bg-gray-800 text-xs px-1 rounded">hallucination_rate</code>).</li>
            </ul>
          </SubSection>

          <SubSection title="Template Syntax">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Variable substitution</p>
                <CodeBlock>{'Hello, {{user_name}}!'}</CodeBlock>
              </div>
              <div className="bg-gray-800 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-1">Component embedding</p>
                <CodeBlock>{'{{component:42}}'}</CodeBlock>
              </div>
            </div>
          </SubSection>

          <SubSection title="Error Codes">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { code: 400, msg: 'Bad request' },
                { code: 404, msg: 'Not found' },
                { code: 409, msg: 'Conflict (duplicate name)' },
                { code: 422, msg: 'Validation / missing variable' },
              ].map(({ code, msg }) => (
                <div key={code} className="bg-gray-800 rounded-lg p-3 flex gap-2 items-start">
                  <StatusBadge code={code} />
                  <span className="text-xs text-gray-300">{msg}</span>
                </div>
              ))}
            </div>
          </SubSection>
        </Section>

        {/* ── Schemas ── */}
        <Section title="Schemas" id="schemas">
          <SubSection title="Prompt">
            <SchemaTable fields={PROMPT_FIELDS} />
          </SubSection>
          <SubSection title="Variable (used inside Prompt.variables)">
            <SchemaTable fields={VARIABLE_FIELDS} />
          </SubSection>
          <SubSection title="Tag">
            <SchemaTable fields={TAG_FIELDS} />
          </SubSection>
          <SubSection title="Agent">
            <SchemaTable fields={AGENT_FIELDS} />
          </SubSection>
          <SubSection title="Execution">
            <SchemaTable fields={EXECUTION_FIELDS} />
          </SubSection>
          <SubSection title="Metric">
            <SchemaTable fields={METRIC_FIELDS} />
          </SubSection>
        </Section>

        {/* ── User Journeys ── */}
        <Section title="User Journeys" id="journeys">
          <SubSection title="1 · Create and render a prompt">
            <JourneyStep
              number={1}
              title="Create a tag (optional)"
              description="Tags help you categorise prompts by environment, use-case, or team."
              code={`POST /api/tags/
{
  "name": "production",
  "color": "#10B981"
}`}
            />
            <JourneyStep
              number={2}
              title="Create a prompt"
              description="Define the template content and declare any variables it uses."
              code={`POST /api/prompts/
{
  "name": "Customer Greeting",
  "content": "Hello, {{user_name}}! Welcome to {{platform}}.",
  "variables": [
    { "name": "user_name", "type": "string", "required": true },
    { "name": "platform", "type": "string", "required": false, "default": "our platform" }
  ],
  "tag_ids": [1]
}`}
            />
            <JourneyStep
              number={3}
              title="Render the prompt with variable values"
              description="Supply runtime values for the declared variables. Required variables must be present."
              code={`POST /api/prompts/1/render
{
  "variables": {
    "user_name": "Alice",
    "platform": "PromptHub"
  }
}

// Response:
{
  "rendered_content": "Hello, Alice! Welcome to PromptHub.",
  "variables_used": ["user_name", "platform"],
  "components_resolved": []
}`}
            />
          </SubSection>

          <SubSection title="2 · Version a prompt">
            <div className="flex items-center gap-2 mb-4 text-xs text-gray-400">
              <span className="bg-gray-700 px-2 py-1 rounded font-mono">v1.0.0</span>
              <ArrowRight size={14} />
              <span className="bg-gray-700 px-2 py-1 rounded font-mono">v1.0.1</span>
              <ArrowRight size={14} />
              <span className="bg-gray-700 px-2 py-1 rounded font-mono">v2.0.0</span>
            </div>
            <JourneyStep
              number={1}
              title="Create a new version"
              description="Only override the fields you want to change. Tags and agents are inherited automatically."
              code={`POST /api/prompts/1/versions
{
  "content": "Hi {{user_name}}, glad to have you on {{platform}}!",
  "description": "Friendlier tone for v1.0.1"
}`}
            />
            <JourneyStep
              number={2}
              title="Inspect the version history"
              description="Retrieve the full lineage regardless of which version ID you supply."
              code={`GET /api/prompts/1/versions

// Returns all versions with is_latest on the newest one.`}
            />
            <JourneyStep
              number={3}
              title="Identify the latest version"
              description={`The response includes "is_latest": true on the most-recent version in the lineage.`}
              code={null}
            />
          </SubSection>

          <SubSection title="3 · Register an agent and track executions">
            <JourneyStep
              number={1}
              title="Register an agent"
              description="Agents represent the LLM-backed services that consume your prompts."
              code={`POST /api/agents/
{
  "name": "support-bot",
  "description": "Handles tier-1 customer support queries.",
  "type": "chatbot",
  "status": "active"
}`}
            />
            <JourneyStep
              number={2}
              title="Associate the agent with a prompt"
              description="Update the prompt to link the agent. This enables per-agent execution tracking."
              code={`PUT /api/prompts/1
{
  "agent_ids": [1]
}`}
            />
            <JourneyStep
              number={3}
              title="Record an execution"
              description="After the agent calls the LLM, log the result. Prompt stats are recalculated automatically."
              code={`POST /api/prompts/1/executions
{
  "agent_id": 1,
  "input_variables": { "user_name": "Alice", "platform": "PromptHub" },
  "rendered_prompt": "Hello, Alice! Welcome to PromptHub.",
  "response": "Thanks for joining us, Alice!",
  "execution_time_ms": 340,
  "token_count": 64,
  "cost": 0.0004,
  "success": 1,
  "rating": 5
}`}
            />
            <JourneyStep
              number={4}
              title="Review agent stats"
              description="The agent detail endpoint aggregates success_rate, avg_rating, and execution_count across all prompts."
              code={`GET /api/agents/1
// Returns execution_count, success_rate, avg_rating.`}
            />
          </SubSection>

          <SubSection title="4 · Build a composable prompt">
            <JourneyStep
              number={1}
              title="Create a reusable component prompt"
              description="This prompt will be embedded in others using its ID."
              code={`POST /api/prompts/
{
  "name": "Safety Disclaimer",
  "content": "Always consult a professional before acting on this advice.",
  "variables": []
}`}
            />
            <JourneyStep
              number={2}
              title="Reference the component in a parent prompt"
              description="Use {{component:<id>}} syntax. The component is resolved recursively at render time."
              code={`POST /api/prompts/
{
  "name": "Medical Advice Bot",
  "content": "Here is some information about {{topic}}.\n\n{{component:2}}",
  "variables": [
    { "name": "topic", "type": "string", "required": true }
  ]
}`}
            />
            <JourneyStep
              number={3}
              title="Render to see the resolved output"
              description="The rendered_content will contain the expanded component text. components_resolved lists every ID used."
              code={`POST /api/prompts/3/render
{ "variables": { "topic": "blood pressure" } }

// rendered_content: "Here is some information about blood pressure.\\n\\nAlways consult a professional..."
// components_resolved: [2]`}
            />
          </SubSection>
        </Section>

        {/* ── Prompts API ── */}
        <Section title="Prompts API" id="prompts-api">
          <Endpoint
            method="GET"
            path="/api/prompts/"
            summary="List prompts"
            description="Returns a paginated list of prompts ordered by most-recently updated. Supports free-text search and filtering by tag or agent."
            params={[
              { name: 'search', in: 'query', type: 'string', description: 'Full-text search against name and description.' },
              { name: 'tag_id', in: 'query', type: 'integer', description: 'Filter to prompts carrying this tag.' },
              { name: 'agent_id', in: 'query', type: 'integer', description: 'Filter to prompts associated with this agent.' },
              { name: 'skip', in: 'query', type: 'integer', description: 'Records to skip (default 0).' },
              { name: 'limit', in: 'query', type: 'integer', description: 'Max records to return, 1–200 (default 50).' },
            ]}
            responses={[{ status: 200, description: 'Array of PromptListResponse objects.' }]}
          />
          <Endpoint
            method="POST"
            path="/api/prompts/"
            summary="Create a prompt"
            description="Creates a new root prompt. Use tag_ids and agent_ids to attach existing resources."
            requestBody={`{
  "name": "Customer Greeting",
  "content": "Hello, {{user_name}}!",
  "description": "Greeting for new users",
  "variables": [
    { "name": "user_name", "type": "string", "required": true }
  ],
  "tag_ids": [],
  "agent_ids": []
}`}
            responses={[
              { status: 201, description: 'PromptResponse — the created prompt.' },
              { status: 422, description: 'Validation error in request body.' },
            ]}
          />
          <Endpoint
            method="GET"
            path="/api/prompts/{prompt_id}"
            summary="Get a prompt"
            description="Retrieves full prompt details including tags, agents, variables, and quality metrics."
            params={[{ name: 'prompt_id', in: 'path', type: 'integer', required: true, description: 'Prompt ID.' }]}
            responses={[
              { status: 200, description: 'PromptResponse.' },
              { status: 404, description: 'Prompt not found.' },
            ]}
          />
          <Endpoint
            method="PUT"
            path="/api/prompts/{prompt_id}"
            summary="Update a prompt"
            description="Partial update. Only fields present in the body are changed. Supplying tag_ids or agent_ids replaces the full association list."
            params={[{ name: 'prompt_id', in: 'path', type: 'integer', required: true, description: 'Prompt ID.' }]}
            requestBody={`{
  "name": "Updated Name",
  "content": "Updated content."
}`}
            responses={[
              { status: 200, description: 'PromptResponse — the updated prompt.' },
              { status: 404, description: 'Prompt not found.' },
            ]}
          />
          <Endpoint
            method="DELETE"
            path="/api/prompts/{prompt_id}"
            summary="Delete a prompt"
            description="Permanently deletes a prompt and its associated executions and metrics."
            params={[{ name: 'prompt_id', in: 'path', type: 'integer', required: true, description: 'Prompt ID.' }]}
            responses={[
              { status: 204, description: 'Deleted.' },
              { status: 404, description: 'Prompt not found.' },
            ]}
          />
          <Endpoint
            method="POST"
            path="/api/prompts/{prompt_id}/versions"
            summary="Create a new version"
            description="Creates a child prompt. Omitted fields are inherited from the parent. The patch version is auto-incremented unless you supply an explicit version string."
            params={[{ name: 'prompt_id', in: 'path', type: 'integer', required: true, description: 'Parent prompt ID.' }]}
            requestBody={`{
  "content": "Updated content for v2.",
  "description": "Improved tone"
}`}
            responses={[
              { status: 201, description: 'PromptResponse — the new version with parent_id set.' },
              { status: 404, description: 'Parent prompt not found.' },
            ]}
          />
          <Endpoint
            method="GET"
            path="/api/prompts/{prompt_id}/versions"
            summary="Get version history"
            description="Returns the complete version lineage (root + all descendants) regardless of which version ID is supplied."
            params={[{ name: 'prompt_id', in: 'path', type: 'integer', required: true, description: 'Any prompt ID in the lineage.' }]}
            responses={[
              { status: 200, description: 'Array of PromptListResponse, ordered root-first.' },
              { status: 404, description: 'Prompt not found.' },
            ]}
          />
          <Endpoint
            method="POST"
            path="/api/prompts/{prompt_id}/render"
            summary="Render a prompt"
            description="Substitutes variables and resolves component references. Required variables must be present in the body."
            params={[{ name: 'prompt_id', in: 'path', type: 'integer', required: true, description: 'Prompt ID.' }]}
            requestBody={`{
  "variables": {
    "user_name": "Alice",
    "platform": "PromptHub"
  }
}`}
            responses={[
              { status: 200, description: 'RenderResponse — rendered_content, variables_used, components_resolved.' },
              { status: 404, description: 'Prompt not found.' },
              { status: 422, description: 'Missing required variable or circular component reference.' },
            ]}
          />
          <Endpoint
            method="POST"
            path="/api/prompts/{prompt_id}/executions"
            summary="Record an execution"
            description="Logs an LLM call result. Prompt stats (usage_count, avg_rating, success_rate) are recalculated automatically."
            params={[{ name: 'prompt_id', in: 'path', type: 'integer', required: true, description: 'Prompt ID.' }]}
            requestBody={`{
  "agent_id": 1,
  "success": 1,
  "rating": 5,
  "execution_time_ms": 340,
  "token_count": 64,
  "cost": 0.0004
}`}
            responses={[
              { status: 201, description: 'ExecutionResponse.' },
              { status: 404, description: 'Prompt not found.' },
            ]}
          />
          <Endpoint
            method="GET"
            path="/api/prompts/{prompt_id}/executions"
            summary="Get execution history"
            description="Returns past executions ordered most-recent first."
            params={[
              { name: 'prompt_id', in: 'path', type: 'integer', required: true, description: 'Prompt ID.' },
              { name: 'skip', in: 'query', type: 'integer', description: 'Offset (default 0).' },
              { name: 'limit', in: 'query', type: 'integer', description: 'Max 200 (default 50).' },
            ]}
            responses={[{ status: 200, description: 'Array of ExecutionResponse.' }]}
          />
          <Endpoint
            method="POST"
            path="/api/prompts/{prompt_id}/metrics"
            summary="Add a custom metric"
            description="Records a named numeric metric for a prompt."
            params={[{ name: 'prompt_id', in: 'path', type: 'integer', required: true, description: 'Prompt ID.' }]}
            requestBody={`{
  "metric_name": "latency_p99",
  "metric_value": 312.5,
  "metadata": { "environment": "production" }
}`}
            responses={[
              { status: 201, description: 'MetricResponse.' },
              { status: 404, description: 'Prompt not found.' },
            ]}
          />
          <Endpoint
            method="GET"
            path="/api/prompts/{prompt_id}/metrics"
            summary="Get custom metrics"
            description="Returns all custom metrics ordered most-recent first."
            params={[{ name: 'prompt_id', in: 'path', type: 'integer', required: true, description: 'Prompt ID.' }]}
            responses={[{ status: 200, description: 'Array of MetricResponse.' }]}
          />
        </Section>

        {/* ── Tags API ── */}
        <Section title="Tags API" id="tags-api">
          <Endpoint
            method="GET"
            path="/api/tags/"
            summary="List tags"
            description="Returns all tags ordered alphabetically by name."
            responses={[{ status: 200, description: 'Array of TagResponse.' }]}
          />
          <Endpoint
            method="POST"
            path="/api/tags/"
            summary="Create a tag"
            description="Creates a new tag. The name must be unique."
            requestBody={`{
  "name": "production",
  "color": "#10B981"
}`}
            responses={[
              { status: 201, description: 'TagResponse — the created tag.' },
              { status: 409, description: 'Tag name already exists.' },
            ]}
          />
          <Endpoint
            method="DELETE"
            path="/api/tags/{tag_id}"
            summary="Delete a tag"
            description="Permanently deletes a tag and removes it from all prompts."
            params={[{ name: 'tag_id', in: 'path', type: 'integer', required: true, description: 'Tag ID.' }]}
            responses={[
              { status: 204, description: 'Deleted.' },
              { status: 404, description: 'Tag not found.' },
            ]}
          />
        </Section>

        {/* ── Agents API ── */}
        <Section title="Agents API" id="agents-api">
          <Endpoint
            method="GET"
            path="/api/agents/"
            summary="List agents"
            description="Returns all agents ordered alphabetically by name."
            responses={[{ status: 200, description: 'Array of AgentResponse.' }]}
          />
          <Endpoint
            method="POST"
            path="/api/agents/"
            summary="Create an agent"
            description="Registers a new agent. The name must be unique."
            requestBody={`{
  "name": "support-bot",
  "description": "Handles tier-1 customer support queries.",
  "type": "chatbot",
  "status": "active"
}`}
            responses={[
              { status: 201, description: 'AgentResponse.' },
              { status: 409, description: 'Agent name already exists.' },
            ]}
          />
          <Endpoint
            method="GET"
            path="/api/agents/{agent_id}"
            summary="Get agent details"
            description="Returns full agent details with associated prompts and aggregate execution stats."
            params={[{ name: 'agent_id', in: 'path', type: 'integer', required: true, description: 'Agent ID.' }]}
            responses={[
              { status: 200, description: 'AgentDetailResponse — includes prompts, execution_count, success_rate, avg_rating.' },
              { status: 404, description: 'Agent not found.' },
            ]}
          />
          <Endpoint
            method="PUT"
            path="/api/agents/{agent_id}"
            summary="Update an agent"
            description="Partial update. Only fields present in the body are changed."
            params={[{ name: 'agent_id', in: 'path', type: 'integer', required: true, description: 'Agent ID.' }]}
            requestBody={`{
  "status": "inactive"
}`}
            responses={[
              { status: 200, description: 'AgentResponse — the updated agent.' },
              { status: 404, description: 'Agent not found.' },
            ]}
          />
          <Endpoint
            method="DELETE"
            path="/api/agents/{agent_id}"
            summary="Delete an agent"
            description="Permanently deletes an agent and removes it from all associated prompts."
            params={[{ name: 'agent_id', in: 'path', type: 'integer', required: true, description: 'Agent ID.' }]}
            responses={[
              { status: 204, description: 'Deleted.' },
              { status: 404, description: 'Agent not found.' },
            ]}
          />
        </Section>

        {/* ── Health API ── */}
        <Section title="Health API" id="health-api">
          <Endpoint
            method="GET"
            path="/api/health"
            summary="Health check"
            description="Returns the current application status and version. Used by the frontend sidebar to display the live application version."
            responses={[
              { status: 200, description: '{ "status": "ok", "version": "<semver>" }' },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
