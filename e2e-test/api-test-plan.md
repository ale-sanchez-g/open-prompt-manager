# Open Prompt Manager API Test Suite

## Application Overview

Comprehensive API test suite for the Open Prompt Manager, a production-ready framework for managing AI prompts with version control, quality metrics, and composability. This test plan covers all REST API endpoints including prompts, agents, tags, health checks, and prompt rendering functionality.

## Test Scenarios

### 1. Health Check API Tests

**Seed:** `e2e-test/seed.spec.ts`

#### 1.1. Health Check - Success

**File:** `e2e-test/specs/health/health-check-success.spec.ts`

**Steps:**
  1. Send GET request to /api/health endpoint
    - expect: Response status code is 200
    - expect: Response contains 'status' field with string value
    - expect: Response contains 'timestamp' field with valid ISO 8601 datetime format
    - expect: Response contains 'version' field with string value
    - expect: Response content-type header is 'application/json'

### 2. Agents API Tests

**Seed:** `e2e-test/seed.spec.ts`

#### 2.1. Agents - Get All Agents (Empty)

**File:** `e2e-test/specs/agents/get-all-agents-empty.spec.ts`

**Steps:**
  1. Send GET request to /api/agents
    - expect: Response status code is 200
    - expect: Response is an empty array []
    - expect: Response content-type header is 'application/json'

#### 2.2. Agents - Create Agent Successfully

**File:** `e2e-test/specs/agents/create-agent-success.spec.ts`

**Steps:**
  1. Send POST request to /api/agents with valid agent data: {"name": "Test Agent", "description": "A test agent for API testing"}
    - expect: Response status code is 201
    - expect: Response contains 'id' field with integer value
    - expect: Response contains 'name' field with value 'Test Agent'
    - expect: Response contains 'description' field with value 'A test agent for API testing'
    - expect: Response contains 'created_at' field with valid ISO 8601 datetime
    - expect: Response contains 'updated_at' field with valid ISO 8601 datetime
    - expect: created_at and updated_at timestamps should be equal

#### 2.3. Agents - Create Agent with Missing Required Fields

**File:** `e2e-test/specs/agents/create-agent-validation-error.spec.ts`

**Steps:**
  1. Send POST request to /api/agents with missing name field: {"description": "Agent without name"}
    - expect: Response status code is 422
    - expect: Response contains validation error details
    - expect: Error indicates missing required 'name' field
  2. Send POST request to /api/agents with missing description field: {"name": "Agent Name"}
    - expect: Response status code is 422
    - expect: Response contains validation error details
    - expect: Error indicates missing required 'description' field

#### 2.4. Agents - Get Specific Agent by ID

**File:** `e2e-test/specs/agents/get-agent-by-id.spec.ts`

**Steps:**
  1. Create a new agent via POST /api/agents
    - expect: Agent creation is successful and returns agent ID
  2. Send GET request to /api/agents/{agent_id} using the created agent ID
    - expect: Response status code is 200
    - expect: Response matches the created agent data
    - expect: All required fields are present and valid

#### 2.5. Agents - Get Non-existent Agent

**File:** `e2e-test/specs/agents/get-agent-not-found.spec.ts`

**Steps:**
  1. Send GET request to /api/agents/99999 (non-existent ID)
    - expect: Response status code is 404
    - expect: Response indicates agent not found

#### 2.6. Agents - Update Agent Successfully

**File:** `e2e-test/specs/agents/update-agent-success.spec.ts`

**Steps:**
  1. Create a new agent via POST /api/agents
    - expect: Agent creation is successful
  2. Send PUT request to /api/agents/{agent_id} with updated data: {"name": "Updated Agent Name", "description": "Updated description"}
    - expect: Response status code is 200
    - expect: Response contains updated name and description
    - expect: updated_at timestamp is newer than created_at
    - expect: ID remains unchanged

#### 2.7. Agents - Update Non-existent Agent

**File:** `e2e-test/specs/agents/update-agent-not-found.spec.ts`

**Steps:**
  1. Send PUT request to /api/agents/99999 with valid data
    - expect: Response status code is 404
    - expect: Response indicates agent not found

#### 2.8. Agents - Delete Agent Successfully

**File:** `e2e-test/specs/agents/delete-agent-success.spec.ts`

**Steps:**
  1. Create a new agent via POST /api/agents
    - expect: Agent creation is successful
  2. Send DELETE request to /api/agents/{agent_id}
    - expect: Response status code is 204
    - expect: Response body is empty
  3. Verify agent was deleted by sending GET request to /api/agents/{agent_id}
    - expect: Response status code is 404
    - expect: Agent is no longer accessible

#### 2.9. Agents - Delete Non-existent Agent

**File:** `e2e-test/specs/agents/delete-agent-not-found.spec.ts`

**Steps:**
  1. Send DELETE request to /api/agents/99999 (non-existent ID)
    - expect: Response status code is 404
    - expect: Response indicates agent not found

### 3. Tags API Tests

**Seed:** `e2e-test/seed.spec.ts`

#### 3.1. Tags - Get All Tags (Empty)

**File:** `e2e-test/specs/tags/get-all-tags-empty.spec.ts`

**Steps:**
  1. Send GET request to /api/tags
    - expect: Response status code is 200
    - expect: Response is an empty array []
    - expect: Response content-type header is 'application/json'

#### 3.2. Tags - Create Tag Successfully

**File:** `e2e-test/specs/tags/create-tag-success.spec.ts`

**Steps:**
  1. Send POST request to /api/tags with valid tag data: {"name": "Test Tag", "color": "#FF5733"}
    - expect: Response status code is 201
    - expect: Response contains 'id' field with integer value
    - expect: Response contains 'name' field with value 'Test Tag'
    - expect: Response contains 'color' field with value '#FF5733'
    - expect: Response contains 'created_at' and 'updated_at' fields

#### 3.3. Tags - Create Tag Without Optional Color

**File:** `e2e-test/specs/tags/create-tag-no-color.spec.ts`

**Steps:**
  1. Send POST request to /api/tags with only name: {"name": "Simple Tag"}
    - expect: Response status code is 201
    - expect: Response contains 'id' and 'name' fields
    - expect: Color field may be null or have default value

#### 3.4. Tags - Create Tag with Missing Name

**File:** `e2e-test/specs/tags/create-tag-validation-error.spec.ts`

**Steps:**
  1. Send POST request to /api/tags with missing name: {"color": "#FF5733"}
    - expect: Response status code is 422
    - expect: Response contains validation error for missing 'name' field

#### 3.5. Tags - Get Tag by ID

**File:** `e2e-test/specs/tags/get-tag-by-id.spec.ts`

**Steps:**
  1. Create a new tag via POST /api/tags
    - expect: Tag creation is successful
  2. Send GET request to /api/tags/{tag_id}
    - expect: Response status code is 200
    - expect: Response matches created tag data

#### 3.6. Tags - Get Non-existent Tag

**File:** `e2e-test/specs/tags/get-tag-not-found.spec.ts`

**Steps:**
  1. Send GET request to /api/tags/99999
    - expect: Response status code is 404

#### 3.7. Tags - Update Tag Successfully

**File:** `e2e-test/specs/tags/update-tag-success.spec.ts`

**Steps:**
  1. Create a new tag via POST /api/tags
    - expect: Tag creation is successful
  2. Send PUT request to /api/tags/{tag_id} with updated data
    - expect: Response status code is 200
    - expect: Response contains updated tag data
    - expect: updated_at timestamp is newer

#### 3.8. Tags - Delete Tag Successfully

**File:** `e2e-test/specs/tags/delete-tag-success.spec.ts`

**Steps:**
  1. Create a new tag via POST /api/tags
    - expect: Tag creation is successful
  2. Send DELETE request to /api/tags/{tag_id}
    - expect: Response status code is 204
  3. Verify tag deletion with GET request
    - expect: Response status code is 404

### 4. Prompts API Tests

**Seed:** `e2e-test/seed.spec.ts`

#### 4.1. Prompts - Get All Prompts (Empty)

**File:** `e2e-test/specs/prompts/get-all-prompts-empty.spec.ts`

**Steps:**
  1. Send GET request to /api/prompts
    - expect: Response status code is 200
    - expect: Response is an empty array []

#### 4.2. Prompts - Get All Prompts with Pagination

**File:** `e2e-test/specs/prompts/get-prompts-pagination.spec.ts`

**Steps:**
  1. Create 15 prompts via POST /api/prompts
    - expect: All prompts are created successfully
  2. Send GET request to /api/prompts?skip=0&limit=10
    - expect: Response status code is 200
    - expect: Response contains exactly 10 prompts
  3. Send GET request to /api/prompts?skip=10&limit=10
    - expect: Response status code is 200
    - expect: Response contains exactly 5 prompts

#### 4.3. Prompts - Get Prompts with Title Filter

**File:** `e2e-test/specs/prompts/get-prompts-title-filter.spec.ts`

**Steps:**
  1. Create prompts with different titles including one with 'unique' in the title
    - expect: Prompts created successfully
  2. Send GET request to /api/prompts?title=unique
    - expect: Response status code is 200
    - expect: Response contains only prompts with 'unique' in title (case-insensitive)

#### 4.4. Prompts - Get Prompts with Tag Filter

**File:** `e2e-test/specs/prompts/get-prompts-tag-filter.spec.ts`

**Steps:**
  1. Create a tag via POST /api/tags
    - expect: Tag created successfully
  2. Create prompts, some with the tag and some without
    - expect: Prompts created successfully
  3. Send GET request to /api/prompts?tag_id={tag_id}
    - expect: Response status code is 200
    - expect: Response contains only prompts with the specified tag

#### 4.5. Prompts - Get Prompts with Agent Filter

**File:** `e2e-test/specs/prompts/get-prompts-agent-filter.spec.ts`

**Steps:**
  1. Create an agent via POST /api/agents
    - expect: Agent created successfully
  2. Create prompts, some associated with the agent and some without
    - expect: Prompts created successfully
  3. Send GET request to /api/prompts?agent_id={agent_id}
    - expect: Response status code is 200
    - expect: Response contains only prompts associated with the specified agent

#### 4.6. Prompts - Create Prompt Successfully

**File:** `e2e-test/specs/prompts/create-prompt-success.spec.ts`

**Steps:**
  1. Send POST request to /api/prompts with valid data: {"title": "Test Prompt", "content": "This is a test prompt with {{variable}}", "description": "Test description"}
    - expect: Response status code is 201
    - expect: Response contains all prompt fields
    - expect: Response includes 'version' field set to 1
    - expect: Response includes empty 'tags' array

#### 4.7. Prompts - Create Prompt with Agent and Tags

**File:** `e2e-test/specs/prompts/create-prompt-with-relationships.spec.ts`

**Steps:**
  1. Create an agent and tag first
    - expect: Agent and tag created successfully
  2. Send POST request to /api/prompts with agent_id and tag_ids
    - expect: Response status code is 201
    - expect: Response includes the associated agent_id
    - expect: Response includes the tags in the tags array

#### 4.8. Prompts - Create Prompt with Missing Required Fields

**File:** `e2e-test/specs/prompts/create-prompt-validation-error.spec.ts`

**Steps:**
  1. Send POST request to /api/prompts with missing title
    - expect: Response status code is 422
    - expect: Validation error indicates missing 'title'
  2. Send POST request to /api/prompts with missing content
    - expect: Response status code is 422
    - expect: Validation error indicates missing 'content'

#### 4.9. Prompts - Get Prompt by ID

**File:** `e2e-test/specs/prompts/get-prompt-by-id.spec.ts`

**Steps:**
  1. Create a prompt via POST /api/prompts
    - expect: Prompt created successfully
  2. Send GET request to /api/prompts/{prompt_id}
    - expect: Response status code is 200
    - expect: Response matches created prompt data

#### 4.10. Prompts - Get Non-existent Prompt

**File:** `e2e-test/specs/prompts/get-prompt-not-found.spec.ts`

**Steps:**
  1. Send GET request to /api/prompts/99999
    - expect: Response status code is 404

#### 4.11. Prompts - Update Prompt Successfully

**File:** `e2e-test/specs/prompts/update-prompt-success.spec.ts`

**Steps:**
  1. Create a prompt via POST /api/prompts
    - expect: Prompt created successfully
  2. Send PUT request to /api/prompts/{prompt_id} with updated data
    - expect: Response status code is 200
    - expect: Response contains updated data
    - expect: Version number is incremented
    - expect: updated_at timestamp is newer

#### 4.12. Prompts - Delete Prompt Successfully

**File:** `e2e-test/specs/prompts/delete-prompt-success.spec.ts`

**Steps:**
  1. Create a prompt via POST /api/prompts
    - expect: Prompt created successfully
  2. Send DELETE request to /api/prompts/{prompt_id}
    - expect: Response status code is 204
  3. Verify deletion with GET request
    - expect: Response status code is 404

#### 4.13. Prompts - Render Prompt with Variables

**File:** `e2e-test/specs/prompts/render-prompt-with-variables.spec.ts`

**Steps:**
  1. Create a prompt with variable placeholders: 'Hello {{name}}, welcome to {{place}}!'
    - expect: Prompt created successfully
  2. Send POST request to /api/prompts/{prompt_id}/render with variables: {"name": "John", "place": "OpenAI"}
    - expect: Response status code is 200
    - expect: rendered_content contains 'Hello John, welcome to OpenAI!'
    - expect: variables_used array contains ['name', 'place']
    - expect: components_resolved array is present

#### 4.14. Prompts - Render Prompt with Component References

**File:** `e2e-test/specs/prompts/render-prompt-with-components.spec.ts`

**Steps:**
  1. Create a base component prompt: 'Base component content'
    - expect: Base component created successfully
  2. Create a main prompt that references the component: 'Main content {{component:{component_id}}}'
    - expect: Main prompt created successfully
  3. Send POST request to /api/prompts/{main_prompt_id}/render
    - expect: Response status code is 200
    - expect: rendered_content contains the resolved component content
    - expect: components_resolved array contains the component ID

#### 4.15. Prompts - Render Prompt Without Variables

**File:** `e2e-test/specs/prompts/render-prompt-static.spec.ts`

**Steps:**
  1. Create a prompt without variable placeholders
    - expect: Prompt created successfully
  2. Send POST request to /api/prompts/{prompt_id}/render with empty or no variables
    - expect: Response status code is 200
    - expect: rendered_content matches original content
    - expect: variables_used is empty array
    - expect: components_resolved is empty array

#### 4.16. Prompts - Render Non-existent Prompt

**File:** `e2e-test/specs/prompts/render-prompt-not-found.spec.ts`

**Steps:**
  1. Send POST request to /api/prompts/99999/render
    - expect: Response status code is 404

### 5. Edge Cases and Error Handling Tests

**Seed:** `e2e-test/seed.spec.ts`

#### 5.1. Invalid HTTP Methods

**File:** `e2e-test/specs/edge-cases/invalid-http-methods.spec.ts`

**Steps:**
  1. Send PATCH request to /api/prompts (unsupported method)
    - expect: Response status code is 405 (Method Not Allowed)
  2. Send OPTIONS request to various endpoints
    - expect: Appropriate CORS headers are returned

#### 5.2. Invalid JSON Payloads

**File:** `e2e-test/specs/edge-cases/invalid-json.spec.ts`

**Steps:**
  1. Send POST request to /api/prompts with malformed JSON
    - expect: Response status code is 400 or 422
    - expect: Error message indicates JSON parsing error

#### 5.3. Large Payload Handling

**File:** `e2e-test/specs/edge-cases/large-payloads.spec.ts`

**Steps:**
  1. Send POST request to /api/prompts with extremely large content (>1MB)
    - expect: Request is handled appropriately (either success or proper error response)
    - expect: No server crash or timeout

#### 5.4. Special Characters and Unicode

**File:** `e2e-test/specs/edge-cases/special-characters.spec.ts`

**Steps:**
  1. Create prompt with unicode characters, emojis, and special symbols
    - expect: Response status code is 201
    - expect: Special characters are preserved correctly

#### 5.5. Circular Component References

**File:** `e2e-test/specs/edge-cases/circular-references.spec.ts`

**Steps:**
  1. Create two prompts that reference each other circularly
    - expect: Prompts created successfully
  2. Attempt to render one of the circular prompts
    - expect: Request completes without infinite loop
    - expect: Error response or circular reference detection

#### 5.6. Boundary Value Testing

**File:** `e2e-test/specs/edge-cases/boundary-values.spec.ts`

**Steps:**
  1. Test pagination with limit=0, limit=100, limit=101
    - expect: limit=0 returns empty results
    - expect: limit=100 works correctly
    - expect: limit=101 is either capped at 100 or returns validation error
  2. Test with negative skip and limit values
    - expect: Appropriate validation errors for negative values

### 6. Data Integrity and Relationships Tests

**Seed:** `e2e-test/seed.spec.ts`

#### 6.1. Cascade Delete Behavior

**File:** `e2e-test/specs/data-integrity/cascade-deletes.spec.ts`

**Steps:**
  1. Create agent, tags, and prompts associated with them
    - expect: All entities created successfully
  2. Delete the agent
    - expect: Agent deleted successfully
  3. Check if prompts still reference the deleted agent
    - expect: Prompts either have agent_id set to null or are deleted
    - expect: System maintains data integrity

#### 6.2. Tag Associations

**File:** `e2e-test/specs/data-integrity/tag-associations.spec.ts`

**Steps:**
  1. Create prompt with multiple tags
    - expect: Prompt created with tags
  2. Delete one of the associated tags
    - expect: Tag deleted successfully
  3. Retrieve the prompt and check tag associations
    - expect: Deleted tag is no longer in prompt's tags array
    - expect: Other tags remain associated

#### 6.3. Version Tracking

**File:** `e2e-test/specs/data-integrity/version-tracking.spec.ts`

**Steps:**
  1. Create a new prompt
    - expect: Prompt created with version 1
  2. Update the prompt multiple times
    - expect: Version number increments with each update
    - expect: Updated timestamps change accordingly

### 7. Performance and Load Tests

**Seed:** `e2e-test/seed.spec.ts`

#### 7.1. Concurrent Request Handling

**File:** `e2e-test/specs/performance/concurrent-requests.spec.ts`

**Steps:**
  1. Send 10 concurrent GET requests to /api/prompts
    - expect: All requests complete successfully
    - expect: No race conditions or data corruption
    - expect: Response times are reasonable

#### 7.2. Large Dataset Pagination

**File:** `e2e-test/specs/performance/large-dataset.spec.ts`

**Steps:**
  1. Create 1000 prompts
    - expect: All prompts created successfully
  2. Test pagination performance with various skip/limit values
    - expect: Pagination works efficiently
    - expect: Response times remain reasonable even with large offsets

### 8. MCP Protocol Tests

**Seed:** `e2e-test/seed.spec.ts`

#### 8.1. MCP Endpoint Basic Connectivity

**File:** `e2e-test/specs/mcp/mcp-connectivity.spec.ts`

**Steps:**
  1. Send POST request to /mcp endpoint with valid MCP protocol data
    - expect: Response status code is 200
    - expect: Response indicates MCP protocol is active
