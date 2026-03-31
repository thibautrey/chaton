/**
 * Work Area Benchmarks
 * 
 * Real-world scenarios for evaluating harness candidates across different
 * work domains. Each benchmark tests practical skills that developers need.
 */

import type {
  HarnessWorkArea,
  MetaHarnessBenchmarkDefinition,
} from "./types.js";

// =============================================================================
// CODE GENERATION BENCHMARK
// =============================================================================

const codeGenerationBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "code-generation",
  workArea: "code-generation",
  name: "Code Generation",
  description: "Writing new code from requirements, scaffolding, and boilerplate generation",
  defaultObjectives: ["correctness", "contextualAwareness", "latency", "tokenCost"],
  isBuiltIn: true,
  tasks: [
    {
      id: "generate-utility-function",
      prompt: `Create a TypeScript utility function called "slugify" that converts a string to a URL-friendly slug.
Requirements:
- Convert to lowercase
- Replace spaces and underscores with hyphens
- Remove special characters except hyphens
- Handle multiple consecutive hyphens
- Trim leading/trailing hyphens

Write the function in a new file and also include JSDoc comments.`,
      expectedFilesCreated: ["*.ts"],
      expectedFileContents: [
        {
          path: "*.ts",
          includes: ["slugify", "function", "export"],
          regex: [String.raw`toLowerCase`, String.raw`replace`, String.raw`trim`],
        },
      ],
      expectedCodePatterns: ["export function", "JSDoc", "@param"],
      difficulty: "easy",
      tags: ["typescript", "utilities", "string-manipulation"],
      successCriteria: "Creates a properly documented, working slugify function",
    },
    {
      id: "generate-api-endpoint",
      prompt: `Create a simple REST API endpoint handler in Express.js for a "users" resource.
Requirements:
- GET /users - list all users
- POST /users - create a new user
- Include input validation
- Include error handling
- Use async/await

Write the code in a way that would fit into an existing Express app.`,
      expectedCodePatterns: [
        "router.get",
        "router.post",
        "async",
        "await",
        "try",
        "catch",
      ],
      expectedToolCalls: ["write"],
      difficulty: "medium",
      tags: ["express", "api", "rest", "nodejs"],
      successCriteria: "Creates a complete, well-structured Express router",
    },
    {
      id: "generate-react-component",
      prompt: `Create a reusable React component called "DataTable" that displays tabular data.
Requirements:
- Accept columns and data as props
- Support sorting by column
- Support row selection
- Include TypeScript types
- Include basic styling
- Handle empty state

Make it production-ready with proper error boundaries.`,
      expectedCodePatterns: [
        "interface",
        "React.FC",
        "useState",
        "useCallback",
        "useMemo",
        "export",
      ],
      expectedImports: ["react"],
      difficulty: "medium",
      tags: ["react", "typescript", "components", "ui"],
      successCriteria: "Creates a complete, typed, reusable DataTable component",
    },
    {
      id: "generate-sql-schema",
      prompt: `Create a SQL schema for a blog application with the following entities:
- Users (id, username, email, created_at)
- Posts (id, user_id, title, content, published, created_at, updated_at)
- Comments (id, post_id, user_id, content, created_at)
- Tags (id, name)
- Post_Tags (many-to-many relationship)

Include:
- Primary keys
- Foreign keys with ON DELETE behavior
- Indexes for performance
- Constraints (unique, not null, etc.)`,
      expectedCodePatterns: [
        "CREATE TABLE",
        "PRIMARY KEY",
        "FOREIGN KEY",
        "REFERENCES",
        "INDEX",
        "UNIQUE",
        "ON DELETE",
      ],
      difficulty: "medium",
      tags: ["sql", "database", "schema-design"],
      successCriteria: "Creates a normalized, well-indexed SQL schema",
    },
    {
      id: "generate-cli-tool",
      prompt: `Create a Node.js CLI tool that converts JSON files to CSV.
Requirements:
- Accept input file path and output file path as arguments
- Handle nested objects by flattening with dot notation
- Support --help flag
- Handle errors gracefully
- Include shebang for direct execution

Make it a complete, publishable package structure.`,
      expectedCodePatterns: [
        "#!/usr/bin/env node",
        "process.argv",
        "fs.readFileSync",
        "fs.writeFileSync",
        "JSON.parse",
        "console.error",
        "process.exit",
      ],
      expectedFilesCreated: ["package.json", "*.js"],
      difficulty: "hard",
      tags: ["nodejs", "cli", "json", "csv", "parsing"],
      successCriteria: "Creates a complete, working CLI tool with proper error handling",
    },
  ],
};

// =============================================================================
// CODE REFACTORING BENCHMARK
// =============================================================================

const codeRefactoringBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "code-refactoring",
  workArea: "code-refactoring",
  name: "Code Refactoring",
  description: "Restructuring code while preserving behavior",
  defaultObjectives: ["correctness", "contextualAwareness", "toolCalls"],
  isBuiltIn: true,
  tasks: [
    {
      id: "extract-function",
      prompt: `Given this code in "utils.js":

function processUserData(users) {
  const results = [];
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const age = new Date().getFullYear() - new Date(user.birthDate).getFullYear();
    const isAdult = age >= 18;
    results.push({
      name: user.name,
      age: age,
      canVote: isAdult
    });
  }
  return results;
}

Refactor to:
1. Extract the age calculation into a separate function
2. Use array methods (map) instead of for loop
3. Add proper TypeScript types
4. Keep the exact same behavior`,
      expectedCodePatterns: [
        "function calculateAge",
        ".map(",
        "interface",
        "User",
      ],
      difficulty: "easy",
      tags: ["refactoring", "typescript", "functions"],
      successCriteria: "Extracts functions and modernizes syntax while preserving behavior",
    },
    {
      id: "rename-symbols",
      prompt: `In the "src/services" directory, rename all occurrences of "userMgr" to "userManager" across multiple files.
Also rename the class "UserMgr" to "UserManager".

Files to update:
- src/services/userMgr.ts
- src/services/auth.ts (imports userMgr)
- src/controllers/userController.ts (uses userMgr)

Do this safely using rename refactoring, not search/replace text.`,
      expectedToolCalls: ["read", "edit"],
      expectedCodePatterns: [
        "userManager",
        "UserManager",
      ],
      forbiddenCodePatterns: ["userMgr", "UserMgr"],
      maxToolCalls: 10,
      difficulty: "medium",
      tags: ["refactoring", "renaming", "symbols"],
      successCriteria: "Consistently renames all symbols across files",
    },
    {
      id: "convert-callbacks-to-async",
      prompt: `Convert the following callback-based code to use async/await:

// oldApi.ts
export function getUser(userId, callback) {
  db.query('SELECT * FROM users WHERE id = ?', [userId], (err, results) => {
    if (err) return callback(err);
    callback(null, results[0]);
  });
}

export function saveUser(user, callback) {
  db.query('INSERT INTO users SET ?', user, (err, result) => {
    if (err) return callback(err);
    callback(null, result.insertId);
  });
}

Convert both functions to return Promises and use async/await pattern.
Maintain the same error handling behavior.`,
      expectedCodePatterns: [
        "Promise",
        "resolve",
        "reject",
        "async",
        "await",
      ],
      forbiddenCodePatterns: ["callback(", "function(err,"],
      difficulty: "medium",
      tags: ["refactoring", "async", "promises", "callbacks"],
      successCriteria: "Converts all callbacks to promises with equivalent error handling",
    },
    {
      id: "extract-module",
      prompt: `The file "helpers.ts" has grown too large with unrelated functions:

// String utilities
export function capitalize(str) { ... }
export function slugify(str) { ... }
export function truncate(str, maxLength) { ... }

// Date utilities  
export function formatDate(date) { ... }
export function parseISO(dateStr) { ... }
export function isWeekend(date) { ... }

// Array utilities
export function unique(arr) { ... }
export function groupBy(arr, key) { ... }
export function sortBy(arr, key) { ... }

Refactor by:
1. Splitting into separate modules (string.ts, date.ts, array.ts)
2. Creating an index.ts that re-exports everything
3. Updating any imports in the codebase
4. Ensuring no breaking changes`,
      expectedFilesCreated: [
        "string.ts",
        "date.ts",
        "array.ts",
        "index.ts",
      ],
      expectedToolCallsMin: 5,
      difficulty: "hard",
      tags: ["refactoring", "modules", "organization"],
      successCriteria: "Splits module while maintaining all exports and updating imports",
    },
  ],
};

// =============================================================================
// DEBUGGING BENCHMARK
// =============================================================================

const debuggingBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "debugging",
  workArea: "debugging",
  name: "Debugging",
  description: "Finding and fixing bugs, error analysis",
  defaultObjectives: ["successRate", "helpfulness", "latency"],
  isBuiltIn: true,
  tasks: [
    {
      id: "diagnose-null-reference",
      prompt: `There's a bug in the following code that causes runtime errors:

function getUserDisplayName(user) {
  return user.profile.name.toUpperCase();
}

Users report "Cannot read property 'toUpperCase' of undefined".

Find the root cause and fix it with proper null checks.`,
      expectedCodePatterns: [
        "?.",
        "??",
        "if",
        "undefined",
        "null",
      ],
      difficulty: "easy",
      tags: ["debugging", "null-safety", "error-handling"],
      successCriteria: "Identifies null reference issue and adds defensive checks",
    },
    {
      id: "fix-async-race-condition",
      prompt: `This code has a race condition bug:

let balance = 100;

async function withdraw(amount) {
  if (balance >= amount) {
    await delay(100); // Simulate network delay
    balance -= amount;
    return { success: true, balance };
  }
  return { success: false, error: 'Insufficient funds' };
}

Multiple concurrent withdrawals can cause overdraft.

Identify the issue and fix it properly.`,
      expectedCodePatterns: [
        "lock",
        "mutex",
        "semaphore",
        "atomic",
        "transaction",
        "queue",
        "Promise.all",
      ],
      difficulty: "medium",
      tags: ["debugging", "async", "race-conditions", "concurrency"],
      successCriteria: "Identifies race condition and implements proper synchronization",
    },
    {
      id: "debug-memory-leak",
      prompt: `This Node.js service has a memory leak:

const subscribers = [];

function subscribe(event, callback) {
  subscribers.push({ event, callback });
}

function emit(event, data) {
  subscribers
    .filter(s => s.event === event)
    .forEach(s => s.callback(data));
}

// Used like:
subscribe('data', handleData);

Over time, memory usage grows continuously.

Find and fix the memory leak.`,
      expectedCodePatterns: [
        "unsubscribe",
        "WeakMap",
        "WeakRef",
        "remove",
        "filter",
        "splice",
      ],
      difficulty: "medium",
      tags: ["debugging", "memory-leaks", "performance"],
      successCriteria: "Identifies missing unsubscribe mechanism and implements cleanup",
    },
    {
      id: "fix-type-error",
      prompt: `TypeScript compiler reports an error in this code:

interface Config {
  port: number;
  host: string;
  ssl?: boolean;
}

function createServer(config: Config) {
  const url = config.ssl ? 'https://' : 'http://';
  return url + config.host + ':' + config.port;
}

// Error: Argument of type '{ port: string; host: string; }' 
// is not assignable to parameter of type 'Config'.
// Types of property 'port' are incompatible.

const myConfig = {
  port: process.env.PORT || 3000,
  host: 'localhost'
};

createServer(myConfig);

Fix the type error while maintaining the logic.`,
      expectedCodePatterns: [
        "as const",
        "satisfies",
        "parseInt",
        "Number(",
        "typeof",
        "string",
        "number",
      ],
      difficulty: "medium",
      tags: ["debugging", "typescript", "types"],
      successCriteria: "Fixes type error with proper type handling",
    },
    {
      id: "investigate-production-issue",
      prompt: `A production API endpoint is returning 500 errors intermittently.

Error logs show:
- "Connection timeout" errors
- Happens under high load
- Database CPU is at 95%
- Some queries take 10+ seconds

The endpoint code:

app.get('/api/orders', async (req, res) => {
  const orders = await db.query('
    SELECT * FROM orders 
    JOIN users ON orders.user_id = users.id
    JOIN products ON orders.product_id = products.id
  ');
  
  const enriched = orders.map(order => {
    const user = await db.query('SELECT * FROM users WHERE id = ?', [order.user_id]);
    const product = await db.query('SELECT * FROM products WHERE id = ?', [order.product_id]);
    return { ...order, user: user[0], product: product[0] };
  });
  
  res.json(enriched);
});

Identify the performance issues and suggest fixes.`,
      expectedCodePatterns: [
        "N+1",
        "JOIN",
        "index",
        "pagination",
        "limit",
        "cache",
        "redis",
      ],
      minResponseLength: 200,
      difficulty: "hard",
      tags: ["debugging", "performance", "databases", "optimization"],
      successCriteria: "Identifies N+1 query problem and suggests proper fixes",
    },
  ],
};

// =============================================================================
// CODE REVIEW BENCHMARK
// =============================================================================

const codeReviewBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "code-review",
  workArea: "code-review",
  name: "Code Review",
  description: "Reviewing changes, catching issues, suggesting improvements",
  defaultObjectives: ["correctness", "helpfulness", "conciseness"],
  isBuiltIn: true,
  tasks: [
    {
      id: "review-security-issue",
      prompt: String.raw`Review this code for security issues:

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  const query = ` + "`" + String.raw`SELECT * FROM users WHERE username = '${username}'` + "`" + String.raw`;
  const user = await db.query(query);
  
  if (user && user.password === password) {
    req.session.userId = user.id;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

Identify all security issues and explain the fixes needed.`,
      expectedCodePatterns: [
        "SQL injection",
        "parameterized",
        "bcrypt",
        "hash",
        "plaintext",
        "timing attack",
      ],
      minResponseLength: 150,
      difficulty: "easy",
      tags: ["code-review", "security", "sql-injection", "authentication"],
      successCriteria: "Identifies SQL injection and plaintext password storage",
    },
    {
      id: "review-performance-issue",
      prompt: `Review this React component for performance issues:

function UserList({ users, onSelect }) {
  const [filter, setFilter] = useState('');
  
  const filteredUsers = users.filter(user => 
    user.name.toLowerCase().includes(filter.toLowerCase())
  );
  
  return (
    <div>
      <input 
        value={filter} 
        onChange={e => setFilter(e.target.value)}
        placeholder="Filter users"
      />
      {filteredUsers.map(user => (
        <UserCard 
          key={user.id}
          user={user}
          onClick={() => onSelect(user)}
        />
      ))}
    </div>
  );
}

Identify performance issues and suggest optimizations.`,
      expectedCodePatterns: [
        "useMemo",
        "useCallback",
        "React.memo",
        "memo",
        "debounce",
        "throttle",
      ],
      difficulty: "medium",
      tags: ["code-review", "react", "performance", "optimization"],
      successCriteria: "Identifies missing memoization and suggests appropriate fixes",
    },
    {
      id: "review-api-design",
      prompt: `Review this API endpoint design:

// POST /api/users/create
// Body: { name: string, email: string, age: number }
// Response: { status: "ok", data: { id, name, email, age } }

// GET /api/users/get?id=123
// Response: { status: "ok", data: { id, name, email, age } }

// POST /api/users/update
// Body: { id: string, updates: { name?, email?, age? } }
// Response: { status: "ok", data: { id, name, email, age } }

// POST /api/users/delete
// Body: { id: string }
// Response: { status: "ok" }

Review the API design against REST best practices and suggest improvements.`,
      expectedCodePatterns: [
        "REST",
        "PUT",
        "PATCH",
        "DELETE",
        "200",
        "201",
        "204",
        "status code",
        "resource",
        "noun",
        "plural",
      ],
      minResponseLength: 200,
      difficulty: "medium",
      tags: ["code-review", "api-design", "rest"],
      successCriteria: "Identifies non-REST patterns and suggests proper HTTP methods and status codes",
    },
    {
      id: "review-error-handling",
      prompt: `Review this error handling code:

async function fetchUserData(userId) {
  try {
    const response = await fetch(\`/api/users/\${userId}\`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

async function displayUser(userId) {
  const user = await fetchUserData(userId);
  document.getElementById('name').textContent = user.name;
  document.getElementById('email').textContent = user.email;
}

Identify issues with error handling and suggest improvements.`,
      expectedCodePatterns: [
        "response.ok",
        "status",
        "throw",
        "Error(",
        "null check",
        "optional chaining",
        "?.",
      ],
      difficulty: "easy",
      tags: ["code-review", "error-handling", "fetch"],
      successCriteria: "Identifies silent failures and missing HTTP error checks",
    },
  ],
};

// =============================================================================
// EXPLORATION BENCHMARK
// =============================================================================

const explorationBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "exploration",
  workArea: "exploration",
  name: "Exploration",
  description: "Understanding unfamiliar codebases and finding relevant code",
  defaultObjectives: ["successRate", "contextualAwareness", "latency"],
  isBuiltIn: true,
  tasks: [
    {
      id: "find-auth-implementation",
      prompt: `I've just joined this codebase. I need to understand how authentication works.

Find and explain:
1. Where authentication logic lives
2. How login/registration is implemented
3. How protected routes are handled
4. Where user sessions/tokens are managed

Search the codebase and provide a summary.`,
      expectedToolCalls: ["read", "bash"],
      expectedRegex: [
        String.raw`auth`,
        String.raw`login`,
        String.raw`session`,
        String.raw`token`,
        String.raw`middleware`,
      ],
      difficulty: "medium",
      tags: ["exploration", "authentication", "codebase"],
      successCriteria: "Finds authentication-related files and explains the flow",
    },
    {
      id: "map-project-structure",
      prompt: `Explore this codebase and provide a high-level overview of:
1. Project architecture pattern (MVC, layered, etc.)
2. Main directories and their purposes
3. Key entry points
4. Configuration files
5. Testing structure

Use the environment snapshot and explore the codebase structure.`,
      expectedRegexAny: [
        String.raw`architecture`,
        String.raw`structure`,
        String.raw`pattern`,
        String.raw`MVC`,
        String.raw`layered`,
        String.raw`monorepo`,
        String.raw`microservices`,
      ],
      expectedRegexAnyMin: 2,
      difficulty: "easy",
      tags: ["exploration", "architecture", "structure"],
      successCriteria: "Provides accurate overview of project structure",
    },
    {
      id: "find-where-feature-lives",
      prompt: `Users report a bug with the "export to CSV" feature. 

Find:
1. Where the export functionality is implemented
2. What files handle CSV generation
3. Any related tests
4. UI components that trigger the export

Search thoroughly and provide file paths.`,
      expectedToolCalls: ["bash", "read"],
      expectedRegex: [
        String.raw`export`,
        String.raw`csv`,
        String.raw`\.csv`,
      ],
      difficulty: "medium",
      tags: ["exploration", "feature-location", "search"],
      successCriteria: "Locates CSV export implementation files",
    },
    {
      id: "trace-data-flow",
      prompt: `I need to understand how user registration data flows through the system.

Starting from the API endpoint, trace:
1. How the request is received
2. What validation happens
3. Where data is transformed
4. How it's stored in the database
5. What events/notifications are triggered

Follow the entire data flow and document it.`,
      expectedRegex: [
        String.raw`endpoint`,
        String.raw`validation`,
        String.raw`database`,
        String.raw`model`,
        String.raw`flow`,
      ],
      minResponseLength: 200,
      difficulty: "hard",
      tags: ["exploration", "data-flow", "tracing"],
      successCriteria: "Accurately traces data flow through the system",
    },
  ],
};

// =============================================================================
// TESTING BENCHMARK
// =============================================================================

const testingBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "testing",
  workArea: "testing",
  name: "Testing",
  description: "Writing tests and test strategies",
  defaultObjectives: ["correctness", "contextualAwareness", "conciseness"],
  isBuiltIn: true,
  tasks: [
    {
      id: "write-unit-tests",
      prompt: `Write comprehensive unit tests for this function:

function calculateDiscount(price, quantity, couponCode) {
  let discount = 0;
  
  // Bulk discount
  if (quantity >= 10) {
    discount += 0.1;
  }
  
  // Coupon codes
  if (couponCode === 'SAVE20') {
    discount += 0.2;
  } else if (couponCode === 'VIP') {
    discount += 0.3;
  }
  
  // Cap at 40%
  discount = Math.min(discount, 0.4);
  
  return price * quantity * (1 - discount);
}

Include tests for:
- Normal cases
- Edge cases (quantity = 0, negative price)
- Boundary cases (quantity = 9, 10)
- Invalid inputs
- Coupon combinations`,
      expectedCodePatterns: [
        "describe",
        "it(",
        "test(",
        "expect(",
        "toBe",
        "toEqual",
        "toThrow",
      ],
      expectedFilesCreated: ["*.test.*", "*.spec.*"],
      difficulty: "medium",
      tags: ["testing", "unit-tests", "jest", "vitest"],
      successCriteria: "Creates comprehensive test suite covering edge cases",
    },
    {
      id: "write-integration-test",
      prompt: `Write an integration test for a user registration API endpoint.

The endpoint:
- POST /api/users
- Accepts: { email, password, name }
- Returns: { id, email, name, createdAt }
- Errors: 400 for invalid input, 409 for duplicate email

Set up proper test database, make requests, and verify responses.
Include cleanup after tests.`,
      expectedCodePatterns: [
        "beforeAll",
        "afterAll",
        "beforeEach",
        "afterEach",
        "request",
        "supertest",
        "expect",
        "async",
        "await",
      ],
      difficulty: "medium",
      tags: ["testing", "integration", "api", "database"],
      successCriteria: "Creates proper integration test with setup and teardown",
    },
    {
      id: "write-e2e-test",
      prompt: `Write an end-to-end test for a login flow:
1. Navigate to login page
2. Enter valid credentials
3. Submit form
4. Verify redirect to dashboard
5. Verify user is logged in (check localStorage/session)
6. Logout and verify redirect to login

Use Playwright or Cypress syntax.`,
      expectedCodePatterns: [
        "test(",
        "describe",
        "page.goto",
        "cy.visit",
        "fill",
        "type",
        "click",
        "expect",
        "toBeVisible",
        "toHaveURL",
      ],
      difficulty: "medium",
      tags: ["testing", "e2e", "playwright", "cypress"],
      successCriteria: "Creates complete E2E test for login flow",
    },
    {
      id: "write-mock-strategy",
      prompt: `The following code makes external API calls that need to be mocked in tests:

async function getWeatherData(city) {
  const response = await fetch(\`https://api.weather.com/v1/current?city=\${city}&apiKey=\${API_KEY}\`);
  const data = await response.json();
  return {
    temperature: data.temp,
    humidity: data.humidity,
    condition: data.condition
  };
}

Refactor to make it testable and write tests using mocks.
Show both the refactored code and the test file.`,
      expectedCodePatterns: [
        "jest.mock",
        "vi.mock",
        "mockResolvedValue",
        "mockReturnValue",
        "spyOn",
        "fetch.mock",
        "inject",
        "interface",
      ],
      difficulty: "hard",
      tags: ["testing", "mocking", "dependency-injection"],
      successCriteria: "Refactors for testability and creates proper mocks",
    },
  ],
};

// =============================================================================
// DOCUMENTATION BENCHMARK
// =============================================================================

const documentationBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "documentation",
  workArea: "documentation",
  name: "Documentation",
  description: "Writing documentation, READMEs, and inline comments",
  defaultObjectives: ["helpfulness", "conciseness", "contextualAwareness"],
  isBuiltIn: true,
  tasks: [
    {
      id: "write-readme",
      prompt: `Create a comprehensive README.md for a new open-source library called "json-utils".

Features to document:
- Deep merge functionality
- Path-based get/set
- JSON schema validation helpers
- Type-safe parsing

Include:
- Installation instructions
- Quick start example
- API reference
- Contributing guidelines
- License`,
      expectedFilesCreated: ["README.md"],
      expectedFileContents: [
        {
          path: "README.md",
          includes: [
            "installation",
            "usage",
            "API",
            "contributing",
            "license",
          ],
          regex: [
            String.raw`#{1,2}\s`,
            String.raw`` + "`" + String.raw`{3}`,
            String.raw`npm install`,
          ],
        },
      ],
      difficulty: "medium",
      tags: ["documentation", "readme", "open-source"],
      successCriteria: "Creates comprehensive, well-structured README",
    },
    {
      id: "document-function",
      prompt: `Add comprehensive JSDoc documentation to this function:

export function debounce(fn, wait, options = {}) {
  let timeout;
  const { leading = false, trailing = true } = options;
  
  return function debounced(...args) {
    const shouldCallNow = leading && !timeout;
    
    clearTimeout(timeout);
    
    timeout = setTimeout(() => {
      if (trailing) fn.apply(this, args);
      timeout = null;
    }, wait);
    
    if (shouldCallNow) fn.apply(this, args);
  };
}

Include:
- Description of what it does
- @param tags with types
- @returns tag
- @example with code
- Edge cases and behavior notes`,
      expectedCodePatterns: [
        "/**",
        "* @param",
        "* @returns",
        "* @example",
        "*/",
        "@description",
      ],
      difficulty: "easy",
      tags: ["documentation", "jsdoc", "comments"],
      successCriteria: "Creates comprehensive JSDoc with all required tags",
    },
    {
      id: "write-changelog",
      prompt: `Write a changelog entry for version 2.0.0 of a library.

Changes in this release:
- Breaking: Removed deprecated callback API (now Promise-only)
- Breaking: Node.js 14+ now required
- Added: New streaming API for large files
- Added: TypeScript types included
- Fixed: Memory leak in connection pooling
- Fixed: Race condition in concurrent requests
- Security: Updated dependencies for CVE-2024-1234

Use proper changelog format (Keep a Changelog style).`,
      expectedCodePatterns: [
        "## [2.0.0]",
        "### Added",
        "### Changed",
        "### Deprecated",
        "### Removed",
        "### Fixed",
        "### Security",
        "BREAKING CHANGE",
      ],
      difficulty: "easy",
      tags: ["documentation", "changelog", "release-notes"],
      successCriteria: "Creates properly formatted changelog with all sections",
    },
    {
      id: "write-architecture-doc",
      prompt: `Create an ARCHITECTURE.md document explaining the design of a microservices-based e-commerce system.

Services:
- API Gateway (Kong)
- User Service (Node.js, PostgreSQL)
- Product Service (Node.js, MongoDB)
- Order Service (Node.js, PostgreSQL)
- Payment Service (Python, external APIs)
- Notification Service (Node.js, Redis queues)

Include:
- High-level architecture diagram (text-based)
- Service responsibilities
- Communication patterns
- Data flow for order placement
- Failure handling strategies`,
      expectedCodePatterns: [
        "## Architecture",
        "## Services",
        "## Data Flow",
        "## Communication",
        "```",
        "+--",
        "|",
        "-->",
      ],
      minResponseLength: 300,
      difficulty: "hard",
      tags: ["documentation", "architecture", "microservices"],
      successCriteria: "Creates comprehensive architecture documentation",
    },
  ],
};

// =============================================================================
// API DESIGN BENCHMARK
// =============================================================================

const apiDesignBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "api-design",
  workArea: "api-design",
  name: "API Design",
  description: "Designing interfaces and type definitions",
  defaultObjectives: ["correctness", "contextualAwareness", "helpfulness"],
  isBuiltIn: true,
  tasks: [
    {
      id: "design-typescript-interfaces",
      prompt: `Design TypeScript interfaces for a task management API.

Entities:
- User (id, email, name, role, createdAt)
- Task (id, title, description, status, priority, assigneeId, createdBy, createdAt, dueDate)
- Comment (id, taskId, userId, content, createdAt)
- Attachment (id, taskId, filename, url, size)

Include:
- Proper types for enums (status, priority, role)
- Nullable/optional fields
- Relationships between types
- DTO types for create/update operations
- Response wrapper types`,
      expectedCodePatterns: [
        "interface",
        "type",
        "enum",
        "export",
        "?",
        "readonly",
        "DTO",
        "Create",
        "Update",
        "Response",
      ],
      difficulty: "medium",
      tags: ["api-design", "typescript", "interfaces", "types"],
      successCriteria: "Creates comprehensive, well-structured type definitions",
    },
    {
      id: "design-rest-api",
      prompt: `Design a RESTful API for a blog platform.

Resources:
- Posts (title, slug, content, author, tags, published, publishedAt, createdAt, updatedAt)
- Comments (postId, author, content, createdAt)
- Tags (name, slug, description)
- Authors (name, bio, avatar, social links)

Design:
- URL patterns for all CRUD operations
- Query parameters for filtering, sorting, pagination
- Request/response body schemas
- HTTP status codes for different scenarios
- Error response format`,
      expectedCodePatterns: [
        "GET",
        "POST",
        "PUT",
        "PATCH",
        "DELETE",
        "/posts",
        "/posts/:id",
        "200",
        "201",
        "204",
        "400",
        "404",
        "page",
        "limit",
        "sort",
        "filter",
      ],
      minResponseLength: 250,
      difficulty: "medium",
      tags: ["api-design", "rest", "http"],
      successCriteria: "Designs complete REST API with proper conventions",
    },
    {
      id: "design-graphql-schema",
      prompt: `Design a GraphQL schema for an e-commerce product catalog.

Entities:
- Product (id, name, description, sku, price, images, variants, categories, inventory)
- Category (id, name, slug, parentId, children)
- Variant (id, productId, name, sku, price, attributes, inventory)
- Attribute (name, value)
- Review (productId, userId, rating, comment, createdAt)

Include:
- Types with proper fields
- Queries (get product, list products, search, filter by category)
- Mutations (create, update, delete)
- Input types
- Pagination (Connection pattern)
- Error handling approach`,
      expectedCodePatterns: [
        "type",
        "input",
        "Query",
        "Mutation",
        "Connection",
        "Edge",
        "PageInfo",
        "first",
        "after",
        "totalCount",
        "edges",
        "node",
      ],
      difficulty: "hard",
      tags: ["api-design", "graphql", "schema"],
      successCriteria: "Designs complete GraphQL schema with pagination",
    },
    {
      id: "design-error-handling-strategy",
      prompt: `Design a comprehensive error handling strategy for a public API.

Requirements:
- Machine-readable error codes
- Human-readable messages
- Request tracking ID for support
- Different error types (validation, auth, not found, rate limit, server)
- HTTP status code mapping
- SDK-friendly error classes

Provide:
- Error response JSON schema
- TypeScript error classes
- Documentation for consumers`,
      expectedCodePatterns: [
        "error",
        "code",
        "message",
        "requestId",
        "ValidationError",
        "NotFoundError",
        "UnauthorizedError",
        "class extends",
        "instanceof",
      ],
      minResponseLength: 200,
      difficulty: "medium",
      tags: ["api-design", "error-handling", "typescript"],
      successCriteria: "Designs comprehensive error handling strategy",
    },
  ],
};

// =============================================================================
// PERFORMANCE BENCHMARK
// =============================================================================

const performanceBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "performance",
  workArea: "performance",
  name: "Performance",
  description: "Optimization, profiling, and identifying bottlenecks",
  defaultObjectives: ["successRate", "contextualAwareness", "latency"],
  isBuiltIn: true,
  tasks: [
    {
      id: "optimize-array-operations",
      prompt: `This code processes a large dataset (100k+ items) and is slow:

function processOrders(orders) {
  const results = [];
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const user = users.find(u => u.id === order.userId);
    const product = products.find(p => p.id === order.productId);
    
    if (user && product) {
      const total = order.quantity * product.price;
      results.push({
        orderId: order.id,
        userName: user.name,
        productName: product.name,
        total: total,
        date: order.date
      });
    }
  }
  return results;
}

Optimize for better performance with large datasets.`,
      expectedCodePatterns: [
        "Map",
        "Set",
        "Object.fromEntries",
        "Map(",
        "reduce",
        "for...of",
        "O(n)",
        "index",
        "lookup",
      ],
      difficulty: "medium",
      tags: ["performance", "optimization", "algorithms"],
      successCriteria: "Transforms O(n²) to O(n) with proper indexing",
    },
    {
      id: "optimize-react-renders",
      prompt: `This React component causes unnecessary re-renders:

function ProductList({ products, onAddToCart }) {
  const [filter, setFilter] = useState('');
  
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(filter.toLowerCase())
  );
  
  const sortedProducts = filteredProducts.sort((a, b) => 
    b.rating - a.rating
  );
  
  return (
    <div>
      <input value={filter} onChange={e => setFilter(e.target.value)} />
      {sortedProducts.map(product => (
        <ProductCard 
          key={product.id}
          product={product}
          onAdd={() => onAddToCart(product)}
        />
      ))}
    </div>
  );
}

Identify and fix the performance issues.`,
      expectedCodePatterns: [
        "useMemo",
        "useCallback",
        "React.memo",
        "memo",
        "useState",
        "useRef",
      ],
      forbiddenCodePatterns: [
        ".sort(", // Should not mutate
      ],
      difficulty: "medium",
      tags: ["performance", "react", "optimization"],
      successCriteria: "Fixes mutation issue and adds proper memoization",
    },
    {
      id: "optimize-database-queries",
      prompt: `This API endpoint is slow under load:

app.get('/api/dashboard', async (req, res) => {
  const totalUsers = await db.query('SELECT COUNT(*) FROM users');
  const totalOrders = await db.query('SELECT COUNT(*) FROM orders');
  const recentOrders = await db.query('
    SELECT * FROM orders 
    ORDER BY created_at DESC 
    LIMIT 10
  ');
  
  const ordersWithUsers = [];
  for (const order of recentOrders) {
    const user = await db.query('SELECT * FROM users WHERE id = ?', [order.user_id]);
    ordersWithUsers.push({ ...order, user: user[0] });
  }
  
  res.json({
    stats: { totalUsers, totalOrders },
    recentOrders: ordersWithUsers
  });
});

Optimize the database queries.`,
      expectedCodePatterns: [
        "JOIN",
        "Promise.all",
        "index",
        "cache",
        "redis",
        "connection pooling",
        "N+1",
      ],
      difficulty: "hard",
      tags: ["performance", "database", "optimization", "sql"],
      successCriteria: "Identifies N+1 and suggests proper JOINs and caching",
    },
  ],
};

// =============================================================================
// SECURITY BENCHMARK
// =============================================================================

const securityBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "security",
  workArea: "security",
  name: "Security",
  description: "Security review and secure coding patterns",
  defaultObjectives: ["correctness", "contextualAwareness", "helpfulness"],
  isBuiltIn: true,
  tasks: [
    {
      id: "secure-input-validation",
      prompt: `Review and secure this user registration endpoint:

app.post('/register', async (req, res) => {
  const { username, password, email } = req.body;
  
  const query = ` + "`" + String.raw`INSERT INTO users (username, password, email) 
                 VALUES ('${username}', '${password}', '${email}')` + "`" + String.raw`;
  
  await db.query(query);
  
  res.json({ success: true });
});

Fix all security vulnerabilities.`,
      expectedCodePatterns: [
        "validation",
        "Joi",
        "zod",
        "validator",
        "prepared",
        "parameterized",
        "bcrypt",
        "hash",
        "salt",
      ],
      forbiddenCodePatterns: [
        "'${username}'",
        "'${password}'",
        "template literal in query",
      ],
      difficulty: "medium",
      tags: ["security", "sql-injection", "input-validation"],
      successCriteria: "Fixes SQL injection, adds validation, and hashes passwords",
    },
    {
      id: "secure-authentication",
      prompt: `Review this JWT authentication middleware:

function authMiddleware(req, res, next) {
  const token = req.headers.authorization;
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

Identify security issues and provide a secure implementation.`,
      expectedCodePatterns: [
        "Bearer",
        "split",
        "refresh",
        "exp",
        "iat",
        "algorithm",
        "HS256",
        "RS256",
        "blacklist",
        "revoke",
      ],
      difficulty: "medium",
      tags: ["security", "jwt", "authentication", "middleware"],
      successCriteria: "Identifies token format issues and suggests best practices",
    },
    {
      id: "secure-headers-config",
      prompt: `Create a secure Content-Security-Policy and security headers configuration for a web application.

Requirements:
- Strict CSP for scripts, styles, images
- Prevent XSS
- Prevent clickjacking
- Secure cookie settings
- HSTS configuration

Provide the complete headers configuration.`,
      expectedCodePatterns: [
        "Content-Security-Policy",
        "X-Frame-Options",
        "X-Content-Type-Options",
        "Strict-Transport-Security",
        "Referrer-Policy",
        "Permissions-Policy",
        "HttpOnly",
        "Secure",
        "SameSite",
        "nonce",
        "self",
      ],
      difficulty: "medium",
      tags: ["security", "headers", "csp", "xss"],
      successCriteria: "Creates comprehensive security headers configuration",
    },
    {
      id: "secure-file-upload",
      prompt: `Review this file upload endpoint:

app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  const filename = file.originalname;
  
  await fs.promises.writeFile(\`./uploads/\${filename}\`, file.buffer);
  
  res.json({ 
    success: true, 
    url: \`/uploads/\${filename}\` 
  });
});

Identify security vulnerabilities and provide a secure implementation.`,
      expectedCodePatterns: [
        "mimetype",
        "magic",
        "file-type",
        "uuid",
        "random",
        "extension",
        "whitelist",
        "virus",
        "clamav",
        "size",
        "limit",
        "path traversal",
        "../",
      ],
      difficulty: "hard",
      tags: ["security", "file-upload", "validation"],
      successCriteria: "Identifies path traversal and type validation issues",
    },
  ],
};

// =============================================================================
// MIGRATION BENCHMARK
// =============================================================================

const migrationBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "migration",
  workArea: "migration",
  name: "Migration",
  description: "Upgrading dependencies and framework migrations",
  defaultObjectives: ["successRate", "correctness", "toolCalls"],
  isBuiltIn: true,
  tasks: [
    {
      id: "upgrade-dependency",
      prompt: `Migrate from Express 4 to Express 5.

Current Express 4 code:
- app.get('/', handler)
- Error handling with 4 parameters
- body-parser middleware

Show:
1. package.json changes
2. Code changes needed
3. Breaking changes to watch for
4. Testing strategy`,
      expectedCodePatterns: [
        "express@5",
        "async",
        "await",
        "error handling",
        "promise",
        "reject",
        "catch",
      ],
      difficulty: "medium",
      tags: ["migration", "express", "upgrade"],
      successCriteria: "Shows complete migration steps and breaking changes",
    },
    {
      id: "migrate-to-typescript",
      prompt: `Migrate this JavaScript file to TypeScript:

// config.js
const config = {
  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    name: process.env.DB_NAME
  },
  cache: {
    enabled: process.env.CACHE_ENABLED === 'true',
    ttl: parseInt(process.env.CACHE_TTL) || 3600
  }
};

module.exports = config;

Create the TypeScript version with:
- Proper types for the config object
- Environment variable validation
- Type-safe accessors`,
      expectedCodePatterns: [
        "interface",
        "type",
        "Config",
        "as const",
        "satisfies",
        "export",
        "string",
        "number",
        "boolean",
      ],
      expectedFilesCreated: ["*.ts"],
      difficulty: "easy",
      tags: ["migration", "typescript", "javascript"],
      successCriteria: "Creates properly typed TypeScript version",
    },
    {
      id: "migrate-database-schema",
      prompt: `Write a migration to add a new "categories" table and link it to existing "products".

Current schema:
- products (id, name, price, created_at)

Migration needs to:
1. Create categories table (id, name, slug, description)
2. Add category_id to products table
3. Create foreign key constraint
4. Create indexes
5. Migrate existing data (set default category)
6. Make category_id not nullable after migration

Write the complete migration script.`,
      expectedCodePatterns: [
        "CREATE TABLE",
        "ALTER TABLE",
        "ADD COLUMN",
        "FOREIGN KEY",
        "INDEX",
        "UPDATE",
        "SET",
        "NOT NULL",
        "transaction",
        "BEGIN",
        "COMMIT",
        "ROLLBACK",
      ],
      difficulty: "hard",
      tags: ["migration", "database", "sql", "schema"],
      successCriteria: "Creates safe, transactional migration with data migration",
    },
  ],
};

// =============================================================================
// ONBOARDING BENCHMARK
// =============================================================================

const onboardingBenchmark: MetaHarnessBenchmarkDefinition = {
  id: "onboarding",
  workArea: "onboarding",
  name: "Onboarding",
  description: "Helping new team members understand the project",
  defaultObjectives: ["helpfulness", "conciseness", "contextualAwareness"],
  isBuiltIn: true,
  tasks: [
    {
      id: "explain-project-structure",
      prompt: `A new developer just joined the team. Explain the project structure to help them get oriented.

Cover:
1. High-level architecture
2. Main directories and their purposes
3. Where to find different types of code
4. Key configuration files
5. How to run the app locally
6. Testing approach

Be concise but comprehensive.`,
      expectedRegex: [
        String.raw`directory`,
        String.raw`folder`,
        String.raw`src`,
        String.raw`test`,
        String.raw`config`,
        String.raw`run`,
        String.raw`npm`,
        String.raw`yarn`,
      ],
      maxResponseLength: 800,
      difficulty: "easy",
      tags: ["onboarding", "project-structure", "documentation"],
      successCriteria: "Provides clear, structured project overview",
    },
    {
      id: "explain-workflow",
      prompt: `Explain the team's development workflow to a new hire:

Topics:
1. Git branching strategy
2. Code review process
3. CI/CD pipeline
4. Deployment process
5. How to make your first contribution

Make it actionable with specific commands.`,
      expectedCodePatterns: [
        "git checkout",
        "git branch",
        "pull request",
        "PR",
        "review",
        "merge",
        "deploy",
        "ci",
        "cd",
      ],
      difficulty: "easy",
      tags: ["onboarding", "workflow", "git", "process"],
      successCriteria: "Explains workflow with specific commands and steps",
    },
    {
      id: "find-first-issue",
      prompt: `Help a new contributor find a good first issue to work on.

Look at the codebase and suggest:
1. Areas suitable for beginners
2. Types of issues to start with (docs, tests, small features)
3. What to avoid as a first contribution
4. How to pick an issue
5. Resources for getting help

Use the environment to understand the project.`,
      expectedRegex: [
        String.raw`good first issue`,
        String.raw`beginner`,
        String.raw`documentation`,
        String.raw`test`,
        String.raw`help wanted`,
        String.raw`CONTRIBUTING`,
      ],
      difficulty: "medium",
      tags: ["onboarding", "contributing", "open-source"],
      successCriteria: "Provides helpful guidance for first contributions",
    },
  ],
};

// =============================================================================
// BENCHMARK REGISTRY
// =============================================================================

export const WORK_AREA_BENCHMARKS: Map<HarnessWorkArea, MetaHarnessBenchmarkDefinition> = new Map([
  ["code-generation", codeGenerationBenchmark],
  ["code-refactoring", codeRefactoringBenchmark],
  ["debugging", debuggingBenchmark],
  ["code-review", codeReviewBenchmark],
  ["exploration", explorationBenchmark],
  ["testing", testingBenchmark],
  ["documentation", documentationBenchmark],
  ["api-design", apiDesignBenchmark],
  ["performance", performanceBenchmark],
  ["security", securityBenchmark],
  ["migration", migrationBenchmark],
  ["onboarding", onboardingBenchmark],
]);

/**
 * Get the benchmark for a specific work area.
 */
export function getBenchmarkForWorkArea(
  workArea: HarnessWorkArea,
): MetaHarnessBenchmarkDefinition {
  const benchmark = WORK_AREA_BENCHMARKS.get(workArea);
  if (benchmark) {
    return benchmark;
  }
  
  // Fallback to environment bootstrap for unknown areas
  return {
    id: workArea,
    workArea,
    name: WORK_AREA_DISPLAY_NAMES[workArea] || workArea,
    description: WORK_AREA_DESCRIPTIONS[workArea] || "",
    tasks: [],
    isBuiltIn: true,
  };
}

/**
 * Get all available benchmarks.
 */
export function getAllBenchmarks(): MetaHarnessBenchmarkDefinition[] {
  return Array.from(WORK_AREA_BENCHMARKS.values());
}

/**
 * Check if a work area has a built-in benchmark.
 */
export function hasBuiltInBenchmark(workArea: HarnessWorkArea): boolean {
  return WORK_AREA_BENCHMARKS.has(workArea);
}

// Import at the end to avoid circular dependencies
import {
  WORK_AREA_DISPLAY_NAMES,
  WORK_AREA_DESCRIPTIONS,
} from "./types.js";
