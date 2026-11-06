/**
 * VerityScout AI — Provider Contract Test Fixtures
 * Governed by: Step 51 (Unit Tests and Provider Contract Tests)
 *
 * Strict Security Invariant: Zero production API keys or credentials.
 * Sourced from official vendor documentation for OpenAI, OpenRouter, NVIDIA NIM, Tavily, Exa, and Firecrawl.
 */

// -----------------------------------------------------------------------------
// 1. OpenAI Responses API Fixtures (Step 28 / Official OpenAI API)
// -----------------------------------------------------------------------------
export const OPENAI_MOCK_SUCCESS_RESPONSE = {
  id: 'resp_abc123xyz',
  object: 'response',
  created_at: 1730887200,
  model: 'gpt-4o',
  status: 'completed',
  output: [
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'output_text',
          text: '{"result":"Framework Laptop 13 features Intel Core i7-1370P processor."}',
        },
      ],
    },
  ],
  usage: {
    input_tokens: 120,
    output_tokens: 45,
    total_tokens: 165,
  },
};

export const OPENAI_MOCK_REFUSAL_RESPONSE = {
  id: 'resp_refused_123',
  object: 'response',
  created_at: 1730887200,
  model: 'gpt-4o',
  status: 'completed',
  output: [
    {
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'refusal',
          refusal: 'I cannot assist with this request due to safety policies.',
        },
      ],
    },
  ],
  usage: {
    input_tokens: 50,
    output_tokens: 15,
    total_tokens: 65,
  },
};

export const OPENAI_MOCK_401_AUTH_ERROR = {
  error: {
    message: 'Incorrect API key provided: test-ke***key.',
    type: 'invalid_request_error',
    param: null,
    code: 'invalid_api_key',
  },
};

export const OPENAI_MOCK_429_RATE_LIMIT_ERROR = {
  error: {
    message: 'Rate limit reached for requests per minute (RPM).',
    type: 'requests',
    param: null,
    code: 'rate_limit_exceeded',
  },
};

export const OPENAI_MOCK_404_MODEL_ERROR = {
  error: {
    message: 'The model "non-existent-model" does not exist or you do not have access to it.',
    type: 'invalid_request_error',
    param: 'model',
    code: 'model_not_found',
  },
};

// -----------------------------------------------------------------------------
// 2. OpenRouter Chat Completions Fixtures (Step 29 / OpenRouter API)
// -----------------------------------------------------------------------------
export const OPENROUTER_MOCK_SUCCESS_RESPONSE = {
  id: 'gen-openrouter-123456',
  provider: 'Anthropic',
  model: 'anthropic/claude-3.5-sonnet',
  object: 'chat.completion',
  created: 1730887200,
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: '{"analysis":"Sony WH-1000XM5 battery life is verified at 30 hours."}',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 150,
    completion_tokens: 60,
    total_tokens: 210,
  },
};

export const OPENROUTER_MOCK_402_CREDIT_ERROR = {
  error: {
    message: 'Insufficient credits. Please add credits at openrouter.ai/credits.',
    code: 402,
    metadata: {
      provider_name: 'Anthropic',
    },
  },
};

export const OPENROUTER_MOCK_429_RATE_LIMIT_ERROR = {
  error: {
    message: 'Upstream provider rate limit exceeded. Please back off and retry.',
    code: 429,
    metadata: {
      provider_name: 'Meta',
    },
  },
};

// -----------------------------------------------------------------------------
// 3. NVIDIA NIM Chat Completions Fixtures (Step 30 / NIM API)
// -----------------------------------------------------------------------------
export const NIM_MOCK_SUCCESS_RESPONSE = {
  id: 'chatcmpl-nim-987654',
  object: 'chat.completion',
  created: 1730887200,
  model: 'meta/llama-3.1-70b-instruct',
  choices: [
    {
      index: 0,
      message: {
        role: 'assistant',
        content: '{"product":"LG C3 65 OLED","price":"1499.99 USD"}',
      },
      finish_reason: 'stop',
    },
  ],
  usage: {
    prompt_tokens: 110,
    completion_tokens: 35,
    total_tokens: 145,
  },
};

export const NIM_MOCK_FASTAPI_DETAIL_ERROR = {
  detail: [
    {
      loc: ['body', 'temperature'],
      msg: 'value must be between 0.0 and 2.0',
      type: 'value_error.number.not_ge',
    },
  ],
};

export const NIM_MOCK_401_AUTH_ERROR = {
  detail: 'Invalid NVIDIA API key.',
};

// -----------------------------------------------------------------------------
// 4. Tavily Search API Fixtures (Step 33 / Tavily API)
// -----------------------------------------------------------------------------
export const TAVILY_MOCK_SUCCESS_RESPONSE = {
  query: 'lg c3 65 inch oled tv specs price',
  response_time: 0.42,
  results: [
    {
      title: 'LG C3 65" Class OLED evo 4K TV - Best Buy',
      url: 'https://www.bestbuy.com/site/lg-65-c3-oled/6535928.p',
      content: 'Experience stunning picture quality with the LG C3 65-inch OLED 4K UHD TV. In stock for $1,499.99.',
      score: 0.94,
      published_date: '2026-10-15',
    },
    {
      title: 'LG OLED65C3PUA 65 Inch OLED TV Review - RTINGS',
      url: 'https://www.rtings.com/tv/reviews/lg/c3-oled',
      content: 'The LG C3 OLED is an excellent TV with deep blacks and 4 HDMI 2.1 ports with 120Hz refresh rate.',
      score: 0.88,
      published_date: '2026-09-20',
    },
  ],
};

export const TAVILY_MOCK_EMPTY_RESPONSE = {
  query: 'nonexistent-product-sku-query-xyz999',
  response_time: 0.15,
  results: [],
};

export const TAVILY_MOCK_401_ERROR = {
  detail: {
    error: 'Invalid API Key provided',
  },
};

// -----------------------------------------------------------------------------
// 5. Exa Search API Fixtures (Step 33 / Exa API)
// -----------------------------------------------------------------------------
export const EXA_MOCK_SUCCESS_RESPONSE = {
  results: [
    {
      title: 'MacBook Pro 14-inch M3 - Apple',
      url: 'https://www.apple.com/macbook-pro-14-and-16/',
      text: 'Apple MacBook Pro 14 with M3 chip, 16GB Unified Memory, 512GB SSD storage starting at $1,599.',
      score: 0.96,
      publishedDate: '2026-10-01',
      id: 'exa-res-1',
    },
  ],
};

// -----------------------------------------------------------------------------
// 6. Firecrawl Extraction API Fixtures (Step 34 / Firecrawl API)
// -----------------------------------------------------------------------------
export const FIRECRAWL_MOCK_SUCCESS_RESPONSE = {
  success: true,
  data: {
    markdown: '# Framework Laptop 13\n\nModular, upgradeable laptop with Intel 13th Gen CPU.\n\n- Price: $1,049 USD\n- Memory: 16GB DDR5\n- Storage: 512GB NVMe SSD',
    metadata: {
      title: 'Framework | Laptop 13 (Intel 13th Gen)',
      description: 'The ultraportable laptop that you can repair and upgrade.',
      sourceURL: 'https://frame.work/products/laptop-13-gen-intel',
      statusCode: 200,
    },
  },
};

export const FIRECRAWL_MOCK_SCRAPE_FAILED_RESPONSE = {
  success: false,
  error: 'Target URL returned HTTP 403 Forbidden: anti-bot challenge detected.',
};

