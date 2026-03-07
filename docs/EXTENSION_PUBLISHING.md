# Publishing Chatons Extensions to npm

This guide explains how to publish your Chatons extensions to npmjs.com.

## Prerequisites

1. **npm Account**: You need an npm account. If you don't have one, sign up at [npmjs.com](https://npmjs.com/).
2. **npm CLI**: Ensure you have npm installed. You can check by running `npm -v` in your terminal.
3. **Logged In**: You must be logged in to npm. Run `npm login` and enter your credentials.

## Extension Requirements

Your extension must meet the following requirements to be published:

1. **Valid Package Name**: Your extension must follow the naming convention `@yourusername/chatons-extension-name`. For example, `@john/chatons-my-extension`.
2. **Valid `package.json`**: Your extension must have a valid `package.json` file with all required fields:
   - `name`: Your extension's name (must match the naming convention)
   - `version`: Your extension's version (semantic versioning recommended)
   - `description`: A description of your extension
   - `main`: The entry point of your extension
   - `chaton.extension.json`: Your extension's manifest file

## Publishing Process

### Step 1: Develop Your Extension

Develop your extension locally and test it thoroughly. Ensure it works as expected and meets all the requirements.

### Step 2: Prepare for Publishing

1. **Check Your `package.json`**: Ensure all required fields are present and correct.
2. **Test Your Extension**: Make sure your extension works as expected.

### Step 3: Publish to npm

1. **Open Chatons**: Launch the Chatons application.
2. **Navigate to Extensions**: Go to the Extensions page.
3. **Find Your Extension**: Locate your extension in the "Installed" section.
4. **Click "Publish"**: Click the "Publish" button next to your extension.

### Step 4: Monitor the Publishing Process

The publishing process will start, and you'll see a notification indicating the progress. Once the process is complete, you'll receive a notification confirming the successful publication.

## Troubleshooting

### Common Issues

1. **Invalid Package Name**: Ensure your package name follows the naming convention `@yourusername/chatons-extension-name`.
2. **Missing `package.json`**: Ensure your extension has a valid `package.json` file.
3. **Not Logged In**: Ensure you're logged in to npm by running `npm login` in your terminal.

### Error Messages

- **"Extension not found"**: Ensure your extension is installed and listed in the "Installed" section.
- **"Only locally installed extensions can be published"**: Ensure your extension is installed locally and not a built-in extension.
- **"Invalid package name"**: Ensure your package name follows the naming convention.
- **"package.json not found"**: Ensure your extension has a valid `package.json` file.

## Best Practices

1. **Versioning**: Use semantic versioning for your extensions (e.g., `1.0.0`, `1.0.1`, `1.1.0`).
2. **Documentation**: Include a `README.md` file with clear instructions on how to use your extension.
3. **Testing**: Test your extension thoroughly before publishing to ensure it works as expected.
4. **Updates**: Regularly update your extension to fix bugs and add new features.

## Updating Your Extension

To update your extension:

1. **Make Changes**: Update your extension's code and increment the version in `package.json`.
2. **Test**: Test your changes thoroughly.
3. **Publish**: Click the "Publish" button again to publish the updated version.

## Conclusion

Publishing your Chatons extensions to npm is a straightforward process. By following this guide, you can share your extensions with the community and contribute to the Chatons ecosystem.
