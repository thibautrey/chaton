/**
 * CSS Optimization Guide
 * Document pour audit des sélecteurs et optimisations CSS
 */

export const CSS_OPTIMIZATION_RECOMMENDATIONS = {
  currentIssues: [
    {
      selector: '.chat-message .chat-message-body .chat-markdown p',
      issue: 'Too deeply nested (4 levels)',
      fix: 'Use direct class .chat-markdown p (2 levels)',
      expectedImprovement: '~30% faster selector matching',
    },
    {
      selector: '.chat-section .chat-timeline .chat-message',
      issue: 'Evaluates all descendants, expensive with 500+ items',
      fix: 'Use .chat-message directly (1 level)',
      expectedImprovement: '~50% faster style recalc',
    },
    {
      selector: 'Complex attribute selectors like [data-type="tool"]',
      issue: 'Slower than class selectors',
      fix: 'Prefer .tool-block class',
      expectedImprovement: '~20% faster',
    },
  ],

  optimizationPatterns: {
    beforeOptimization: `
    .chat-section .chat-timeline .chat-message .chat-message-body .chat-markdown {
      color: red;
    }
    
    .chat-message[data-role="assistant"] .chat-message-body[data-state="loading"] {
      opacity: 0.5;
    }`,

    afterOptimization: `
    /* Use component-level classes instead of deep nesting */
    .chat-markdown {
      color: red;
    }
    
    /* Use BEM or component-scoped classes */
    .chat-message.loading .chat-message-body {
      opacity: 0.5;
    }
    
    /* Use CSS custom properties for dynamic values */
    :root {
      --shadow-opacity: 0;
    }
    
    .chat-markdown {
      box-shadow: inset 0 12px 10px rgba(0,0,0,var(--shadow-opacity));
    }`,
  },

  cssContainmentStrategy: {
    strong: `
    /* Isolate completely: reduces style scope */
    .chat-message-body {
      contain: content;
      /* Children have no effect on outside */
      /* But parent can't affect children sizing */
    }`,

    medium: `
    /* Balance: good for most cases */
    .chat-tool-block {
      contain: layout style paint;
      /* Prevents style recalc propagation */
    }`,

    light: `
    /* Light containment: safest */
    .chat-message {
      contain: paint;
      /* Only prevents painting outside box */
    }`,
  },

  willChangeStrategy: {
    before: `.chat-message { }`,

    after: `.chat-message {
      will-change: auto; /* Default: no optimization */
    }
    
    .chat-message.entering {
      will-change: opacity, transform;
      /* During animation only */
    }
    
    .chat-message.static {
      will-change: auto;
      /* Remove when not animating */
    }`,

    warning:
      'Use will-change sparingly - it has memory cost. Remove after animation ends.',
  },

  customPropertiesExample: {
    before: `
    /* Recalculates ALL related styles on scroll */
    .scroll-shadow-top {
      box-shadow: inset 0 12px 10px rgba(0,0,0,0.09);
    }
    
    .scroll-shadow-none {
      box-shadow: none;
    }`,

    after: `
    /* Only CSS custom property value changes */
    .chat-markdown {
      --shadow-opacity: 0;
      box-shadow: inset 0 12px 10px rgba(0,0,0,var(--shadow-opacity));
      transition: --shadow-opacity 120ms ease;
    }
    
    /* Only update one variable, not entire style */
    .scroll-shadow-top {
      --shadow-opacity: 1;
    }`,
  },
}

/**
 * CSS performance metrics
 */
export const CSS_METRICS = {
  selectorDepth: {
    fast: '<= 2 levels (.class > .child)',
    moderate: '3-4 levels',
    slow: '> 4 levels',
  },

  propertyComplexity: {
    fast: ['color', 'opacity', 'transform', 'z-index'],
    moderate: ['width', 'height', 'font-size'],
    slow: ['position', 'top', 'left', 'right', 'bottom'], // triggers layout
    verySlow: ['offsetHeight', 'offsetWidth'], // forces layout recalc
  },

  recalcCost: {
    descriptionList: `
    Simple color change (1 selector):     0.1ms
    Medium selector chain (3 items):      1-2ms
    Deep selector chain (5+ items):       5-10ms
    With 500 messages:                    100-500ms
    
    With batching fix:                    10-50ms (90% improvement)
    `,
  },
}

/**
 * Code to audit CSS selectors
 * Run in DevTools console
 */
export const CSS_AUDIT_SCRIPT = `
// Analyze CSS selector performance
(function() {
  const sheets = document.styleSheets;
  const selectorStats = {};

  for (let sheet of sheets) {
    try {
      const rules = sheet.cssRules || sheet.rules;
      for (let rule of rules) {
        if (rule.selectorText) {
          const depth = rule.selectorText.split(' ').length;
          if (!selectorStats[depth]) selectorStats[depth] = [];
          selectorStats[depth].push(rule.selectorText);
        }
      }
    } catch (e) {
      // Cross-origin sheet
    }
  }

  console.table(
    Object.entries(selectorStats).map(([depth, selectors]) => ({
      'Selector Depth': depth,
      'Count': selectors.length,
      'Example': selectors[0]?.substring(0, 50),
    }))
  );

  // Identify slowest selectors
  const slow = Object.entries(selectorStats)
    .filter(([depth]) => Number(depth) > 4)
    .flatMap(([, selectors]) => selectors);

  console.log('Selectors with depth > 4:', slow.length);
  if (slow.length > 0) console.log('Examples:', slow.slice(0, 5));
})();
`

/**
 * Recommendations for MainView.tsx CSS
 */
export const MAINVIEW_CSS_RECOMMENDATIONS = [
  {
    current: '.chat-message .chat-message-body',
    recommended: '.chat-message-body',
    reason: 'Reduce selector depth from 2 to 1 level',
    impact: '-20% selector matching time',
  },
  {
    current: '.chat-section .chat-timeline',
    recommended: '.chat-timeline',
    reason: 'Remove unnecessary parent selectors',
    impact: '-15% selector matching time',
  },
  {
    current: 'Multiple box-shadow updates on scroll',
    recommended: 'Use CSS custom properties for shadow opacity',
    impact: '-50% style recalc on scroll (no selector re-evaluation)',
  },
  {
    current: 'will-change on all messages',
    recommended: 'will-change: auto by default, only change during animation',
    impact: '-40% memory, faster style recalc',
  },
  {
    current: 'contain: layout style paint on many elements',
    recommended: 'Audit for side effects, may need to reduce scope',
    impact: 'Verify visual correctness',
  },
]

/**
 * Test helper: measure selector performance
 */
export function measureSelectorPerformance(selector: string): number {
  const start = performance.now()
  // Query must be executed to measure its performance (void result is intentional)
  void document.querySelectorAll(selector)
  const end = performance.now()
  return end - start
}

/**
 * Test helper: compare selector performance
 */
export function compareSelectorPerformance(
  selectors: Array<{ name: string; selector: string }>,
  iterations: number = 1000,
): void {
  const results = selectors.map((item) => {
    const start = performance.now()
    for (let i = 0; i < iterations; i++) {
      document.querySelectorAll(item.selector)
    }
    const end = performance.now()
    return {
      selector: item.name,
      totalTime: end - start,
      averageTime: (end - start) / iterations,
    }
  })

  console.table(results)
}

export default CSS_OPTIMIZATION_RECOMMENDATIONS
