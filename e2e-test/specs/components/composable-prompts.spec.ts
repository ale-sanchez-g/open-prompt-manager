// spec: e2e-test/api-test-plan.md
// seed: e2e-test/seed.spec.ts

import { test, expect, APIRequestContext } from '@playwright/test';

function uniqueName(prefix: string): string {
  return `${prefix}-${Math.floor(Math.random() * 1000000)}`;
}

async function createPrompt(
  request: APIRequestContext,
  payload: {
    name: string;
    content: string;
    description?: string;
    version?: string;
    agent_ids?: number[];
    tag_ids?: number[];
    components?: number[];
  }
): Promise<any> {
  const response = await request.post('/api/prompts/', { data: payload });
  expect(response.status()).toBe(201);
  return response.json();
}

test.describe('Composable Prompts API Tests', () => {
  let createdPromptIds: number[];

  test.beforeEach(async () => {
    createdPromptIds = [];
  });

  test.afterEach(async ({ request }) => {
    for (const promptId of createdPromptIds) {
      const response = await request.delete(`/api/prompts/${promptId}`);
      expect([204, 404]).toContain(response.status());
    }
  });

  test('Composable Prompts - Create prompt with components field', async ({ request }) => {
    // Create the component prompt first
    const componentPrompt = await createPrompt(request, {
      name: uniqueName('component-prompt'),
      content: 'Reusable component content',
      description: 'A reusable component prompt',
    });
    createdPromptIds.push(componentPrompt.id);

    // Create a main prompt referencing the component via the components field
    const mainPrompt = await createPrompt(request, {
      name: uniqueName('main-prompt-with-components-field'),
      content: 'Main prompt content',
      description: 'Prompt with components field set',
      components: [componentPrompt.id],
    });
    createdPromptIds.push(mainPrompt.id);

    expect(mainPrompt).toHaveProperty('id');
    expect(mainPrompt).toHaveProperty('components');
  });

  test('Composable Prompts - Get prompt returns components field', async ({ request }) => {
    // Create a prompt
    const prompt = await createPrompt(request, {
      name: uniqueName('prompt-for-get'),
      content: 'Content for get test',
      description: 'Testing GET returns components field',
    });
    createdPromptIds.push(prompt.id);

    // GET /api/prompts/{id}
    const getResponse = await request.get(`/api/prompts/${prompt.id}`);
    expect(getResponse.status()).toBe(200);

    const body = await getResponse.json();
    expect(body).toHaveProperty('components');
    expect(Array.isArray(body.components)).toBe(true);
  });

  test('Composable Prompts - Render prompt with inline component reference', async ({ request }) => {
    // Create the component prompt
    const componentPrompt = await createPrompt(request, {
      name: uniqueName('alpha-component'),
      content: 'Component alpha content',
      description: 'Alpha reusable component',
    });
    createdPromptIds.push(componentPrompt.id);

    // Create the main prompt referencing the component inline
    const mainPrompt = await createPrompt(request, {
      name: uniqueName('main-with-inline-component'),
      content: `Intro: {{component:${componentPrompt.id}}}`,
      description: 'Prompt that uses an inline component reference',
    });
    createdPromptIds.push(mainPrompt.id);

    // Render the main prompt
    const renderResponse = await request.post(`/api/prompts/${mainPrompt.id}/render`, {
      data: { variables: {} },
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toContain('Component alpha content');
    expect(body.components_resolved).toContain(componentPrompt.id);
  });

  test('Composable Prompts - Render prompt with multiple component references', async ({ request }) => {
    // Create first component prompt
    const componentOne = await createPrompt(request, {
      name: uniqueName('component-one'),
      content: 'First component content',
      description: 'First reusable component',
    });
    createdPromptIds.push(componentOne.id);

    // Create second component prompt
    const componentTwo = await createPrompt(request, {
      name: uniqueName('component-two'),
      content: 'Second component content',
      description: 'Second reusable component',
    });
    createdPromptIds.push(componentTwo.id);

    // Create main prompt referencing both components
    const mainPrompt = await createPrompt(request, {
      name: uniqueName('main-with-multiple-components'),
      content: `Start: {{component:${componentOne.id}}} and {{component:${componentTwo.id}}} End.`,
      description: 'Prompt that references two components',
    });
    createdPromptIds.push(mainPrompt.id);

    // Render the main prompt
    const renderResponse = await request.post(`/api/prompts/${mainPrompt.id}/render`, {
      data: { variables: {} },
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toContain('First component content');
    expect(body.rendered_content).toContain('Second component content');
    expect(body.components_resolved).toContain(componentOne.id);
    expect(body.components_resolved).toContain(componentTwo.id);
  });

  test('Composable Prompts - Render prompt with nested components', async ({ request }) => {
    // Create the leaf component prompt
    const leafComponent = await createPrompt(request, {
      name: uniqueName('leaf-component'),
      content: 'Leaf component content',
      description: 'Innermost reusable component',
    });
    createdPromptIds.push(leafComponent.id);

    // Create the middle component that references the leaf
    const middleComponent = await createPrompt(request, {
      name: uniqueName('middle-component'),
      content: `Middle wraps leaf: {{component:${leafComponent.id}}}`,
      description: 'Middle component referencing leaf',
    });
    createdPromptIds.push(middleComponent.id);

    // Create the top-level prompt that references the middle component
    const topPrompt = await createPrompt(request, {
      name: uniqueName('top-prompt-nested'),
      content: `Top references middle: {{component:${middleComponent.id}}}`,
      description: 'Top-level prompt with nested component chain',
    });
    createdPromptIds.push(topPrompt.id);

    // Render the top-level prompt
    const renderResponse = await request.post(`/api/prompts/${topPrompt.id}/render`, {
      data: { variables: {} },
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toContain('Leaf component content');
    expect(body.components_resolved).toContain(leafComponent.id);
    expect(body.components_resolved).toContain(middleComponent.id);
  });

  test('Composable Prompts - Update prompt to add component reference', async ({ request }) => {
    // Create the component prompt
    const componentPrompt = await createPrompt(request, {
      name: uniqueName('component-for-update'),
      content: 'Component content for update test',
      description: 'Component used in update test',
    });
    createdPromptIds.push(componentPrompt.id);

    // Create the main prompt with plain content (no component reference yet)
    const mainPrompt = await createPrompt(request, {
      name: uniqueName('main-prompt-plain'),
      content: 'Plain content without any component reference',
      description: 'Main prompt before update',
    });
    createdPromptIds.push(mainPrompt.id);

    // PUT to update the main prompt content to include the component reference
    const updatedContent = `Updated content with {{component:${componentPrompt.id}}}`;
    const updateResponse = await request.put(`/api/prompts/${mainPrompt.id}`, {
      data: {
        name: mainPrompt.name,
        content: updatedContent,
        description: 'Main prompt after update',
      },
    });
    expect(updateResponse.status()).toBe(200);

    const updatedBody = await updateResponse.json();
    expect(updatedBody.content).toContain(`{{component:${componentPrompt.id}}}`);
  });

  test('Composable Prompts - Update prompt components field', async ({ request }) => {
    // Create the first component prompt
    const firstComponent = await createPrompt(request, {
      name: uniqueName('first-component'),
      content: 'First component content',
      description: 'Initial component',
    });
    createdPromptIds.push(firstComponent.id);

    // Create the second (new) component prompt
    const newComponent = await createPrompt(request, {
      name: uniqueName('new-component'),
      content: 'New component content',
      description: 'Replacement component',
    });
    createdPromptIds.push(newComponent.id);

    // Create main prompt initially referencing the first component
    const mainPrompt = await createPrompt(request, {
      name: uniqueName('main-prompt-for-components-update'),
      content: 'Main prompt content',
      description: 'Main prompt with initial component',
      components: [firstComponent.id],
    });
    createdPromptIds.push(mainPrompt.id);

    // PUT to update the main prompt's components field to reference the new component
    const updateResponse = await request.put(`/api/prompts/${mainPrompt.id}`, {
      data: {
        name: mainPrompt.name,
        content: mainPrompt.content,
        description: mainPrompt.description,
        components: [newComponent.id],
      },
    });
    expect(updateResponse.status()).toBe(200);

    const updatedBody = await updateResponse.json();
    expect(updatedBody).toHaveProperty('components');
    expect(updatedBody.components).toContain(newComponent.id);
  });

  test('Composable Prompts - Render component variables are resolved', async ({ request }) => {
    // Create the component prompt with a variable placeholder
    const componentPrompt = await createPrompt(request, {
      name: uniqueName('variable-component'),
      content: 'Hello {{name}}',
      description: 'Component with a variable placeholder',
    });
    createdPromptIds.push(componentPrompt.id);

    // Create the main prompt that references the component inline
    const mainPrompt = await createPrompt(request, {
      name: uniqueName('main-prompt-variable-component'),
      content: `Intro: {{component:${componentPrompt.id}}}`,
      description: 'Main prompt referencing a component with variables',
    });
    createdPromptIds.push(mainPrompt.id);

    // Render the main prompt passing the variable value
    const renderResponse = await request.post(`/api/prompts/${mainPrompt.id}/render`, {
      data: { variables: { name: 'World' } },
    });
    expect(renderResponse.status()).toBe(200);

    const body = await renderResponse.json();
    expect(body.rendered_content).toContain('Hello World');
  });
});
