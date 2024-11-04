import * as vscode from 'vscode';
import { Ollama } from 'ollama';
import eslint from 'eslint';
import generateUnitTests from './commands/generateUnitTests'
import refactorCode from './commands/refactorCode';
import lintCode from './commands/lintCode';
import prettier from 'prettier';
import { HfInference } from '@huggingface/inference';

interface Models {
  label: string,
  description: string
}

let conversationHistory: { userInput: string, aiResponse: string }[] = []; // Array to store the conversation history

const config = vscode.workspace.getConfiguration('files', null);
config.get('watcherExclude');

// List of models to choose from
const models: Models[] = [
  { label: 'llama3.2:3b', description: 'Llama3.2 3B' },
  { label: 'deepseek-coder-v2:16b', description: 'DeepSeek Coder 16B' },
  { label: 'qwen2.5-coder:7b', description: 'Qwen2.5 Coder 7B' }, // Add more models as needed
  { label: 'granite3-moe:3b', description: 'IBM Granite3 Moe 3B ' }, // Add more models as needed
];

const languageToTestFrameworkMap: { [key: string]: string} = {
    javascript: "Jest",
    typescript: "Jest"
}

const languageToParser: { [key: string]: prettier.BuiltInParserName} = {
    javascript: "babel",
    typescript: "typescript",
    css: "css",
    html: "html",
    json: "json",
    markdown: "markdown",
    yaml: "yaml",
}

let selectedModel = models[0].label // Default model

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
    const ollama = new Ollama({ host: 'http://127.0.0.1:11434' })
    console.log("Extension 'code-edit-qwen25' is now active!");

    const HF_TOKEN = process.env.HF_TOKEN;

    if (!HF_TOKEN) {
        vscode.window.showErrorMessage('Hugging Face token not found. Please set HF_TOKEN.');
        return;
    }

    const inference = new HfInference(HF_TOKEN);
    const ANNOTATION_PROMPT = `You are an AI code assistant designed to help developers understand and improve their code.
    Given the following code snippet, please:
    1. Provide a brief, focused explanation of what the code does.
    2. Suggest only essential improvements related to readability, maintainability, or performance.
    3. Return only the corrected or refactored code in JavaScript format without any additional explanations, line breaks, or indentation.
    4. Ensure the code is formatted with consistent spacing and compact layout, avoiding unnecessary line breaks.
    Code to explain:
    `;
    
    let selectModel = vscode.commands.registerCommand('code-edit-qwen25.selectModel', async () => {
      const pickedModel = await vscode.window.showQuickPick(models, {
        placeHolder: 'Select a model for code generation',
      });
    
      if (pickedModel && typeof pickedModel.label === 'string') {
        selectedModel = pickedModel.label;  // Ensure selectedModel is a string

           // Check if the model is already pulled
           const availableModelsResponse = await ollama.list();
           const availableModelNames = availableModelsResponse.models.map((model: { name: string }) => model.name);     
            const isModelAvailable = availableModelNames.includes(selectedModel);

            if (isModelAvailable) {
                vscode.window.showInformationMessage(`Model ${pickedModel.description} is already available.`);
                return;
            }
            // Show a notification that the model is being pulled
            vscode.window.withProgress(
                {
                location: vscode.ProgressLocation.Notification,
                title: `Pulling model: ${selectedModel}`,
                cancellable: false,
                },
                async () => {
                    try {
                        // Pull the model using Ollama
                        await ollama.pull({ model: selectedModel });
            
                        // Notify the user that the model is ready
                        vscode.window.showInformationMessage(`Model ${pickedModel.description} is now ready for use.`);
                    } catch (error: any) {
                        vscode.window.showErrorMessage(`Failed to pull model ${pickedModel.description}: ${error.message}`);
                    }
                }
            );
        } else {
            vscode.window.showErrorMessage('Invalid model selection');
        }
    });

    let refactoredCode = vscode.commands.registerTextEditorCommand('code-edit-qwen25.refactor', async (editor) => {
        await refactorCode(editor, selectedModel, languageToTestFrameworkMap, ollama, prettier, languageToParser);
    });

    let createUnitTests = vscode.commands.registerTextEditorCommand('code-edit-qwen25.generateUnitTests', async (editor) => {
        await generateUnitTests(editor, selectedModel, languageToTestFrameworkMap, ollama, prettier, languageToParser);
    });

    let completionProvider = vscode.languages.registerCompletionItemProvider(
        {scheme: 'file', language: 'javascript'},
        {
            async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const linePrefix = document.lineAt(position).text.substr(0, position.character);
                const inputs = `Based on the following code context, suggest the next logical line. Provide only the suggested line of code:
                                Context:
                                ${linePrefix}`;
                try{
                    const response = await ollama.generate({
                        model: selectedModel,
                        prompt: inputs,
                        options: {
                            temperature: 0.5,   // Adjust for more deterministic responses
                            top_p: 0.8,
                        },
                    });
    
                    const suggestion = response.response.trim();
                    if (suggestion) {
                        const completionItem = new vscode.CompletionItem(suggestion, vscode.CompletionItemKind.Snippet);
                        completionItem.insertText = suggestion;
                        return [completionItem];
                    }
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Error generating code completion: ${error.message}`);
                }
    
                return [];
            }
            
    }, '.');

    let lintedCode = vscode.commands.registerTextEditorCommand('code-edit-qwen25.lintCode', async (editor) => {
            await lintCode(editor, selectedModel, languageToTestFrameworkMap, ollama, prettier, languageToParser);
    });

    let disposable = vscode.commands.registerCommand('code-edit-qwen25.explainCode', async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const userMessage = editor.document.getText(editor.selection);

            // Show loading indicator in the webview while waiting for response
            vscode.commands.executeCommand('textGenerationView.update', conversationHistory, true); // true indicates "loading"
            console.log(selectedModel)
            vscode.window.showInformationMessage(`Model changed to ${selectedModel}`);
            try {
                const newResponse = await ollama.generate({
                    model: selectedModel,
                    prompt: ANNOTATION_PROMPT + userMessage,
                    options: {
                    temperature: 0.7,                 // Control response randomness
                    top_p: 0.9,                       // Set to balance diversity and focus
                }
                })

                vscode.window.showInformationMessage(`Respnse details: ${newResponse}`);

                let generatedMessage = newResponse.response;

                // // Remove ANNOTATION_PROMPT and userMessage from the AI response
                // generatedMessage = filterAIResponse(generatedMessage, userMessage, ANNOTATION_PROMPT);

                // Append the user input and AI response to the conversation history
                conversationHistory.push({ userInput: userMessage, aiResponse: generatedMessage });

                // Send the updated conversation history to the webview and hide the loading indicator
                vscode.commands.executeCommand('textGenerationView.update', conversationHistory, false); // false indicates no longer loading


            } catch (error: any) {
                vscode.window.showErrorMessage(`Error generating text: ${error.message}`);
            }
        }

    });
        
    // Create a webview for text generation inside the new sidebar
    vscode.window.registerWebviewViewProvider('textGenerationView', new TextGenerationViewProvider(context, inference));

    context.subscriptions.push(createUnitTests, lintedCode, refactoredCode, disposable, selectModel);
}

let suggestionCount = 0;

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
statusBarItem.text = `AI Suggestions: ${suggestionCount}`;
statusBarItem.show();

// Each time a suggestion is made, increment the counter
suggestionCount++;
statusBarItem.text = `AI Suggestions: ${suggestionCount}`;

class TextGenerationViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, inference: HfInference) {
        this.context = context;
    }

    resolveWebviewView(view: vscode.WebviewView): void | Thenable<void> {
        this._view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = this.getHtmlForWebview([], false); // Initially render an empty conversation without loading

        // Register a listener for the update command
        vscode.commands.registerCommand('textGenerationView.update', (conversationHistory: { userInput: string, aiResponse: string }[], isLoading: boolean) => {
            if (this._view) {
                this._view.webview.html = this.getHtmlForWebview(conversationHistory, isLoading);
            }
        });
    }

    getHtmlForWebview(conversationHistory: { userInput: string, aiResponse: string }[], isLoading: boolean): string {
        // Generate HTML for the entire conversation history
        const conversationHtml = conversationHistory.map(entry => {
            const formattedUserMessage = this.formatText(entry.userInput);
            const formattedGeneratedMessage = this.formatText(entry.aiResponse);

            return `
                <div class="text-section">
                    <h2>User Input</h2>
                    <p class="user-input">
                    <pre class="code-block">${formattedUserMessage}</pre></p>
                    <h2>AI Response</h2>
                    <div class="ai-response">
                        ${formattedGeneratedMessage}
                    </div>
                </div>`;
        }).join(''); // Join all conversation entries

        // Add loading spinner or message if isLoading is true
        const loadingHtml = isLoading ? `<div class="loading">Loading response... <div class="spinner"></div></div>` : '';

        return `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; padding: 10px; }
                    .user-input { color: #007acc; font-weight: bold; }
                    .ai-response { background-color: #f4f4f4; padding: 10px; border-radius: 5px; margin-top: 20px; color: black; }
                    .code-block { text-wrap: wrap; }
                    .loading { font-size: 16px; color: #888888; margin-top: 20px; }
                    .spinner {
                        margin-left: 10px;
                        display: inline-block;
                        width: 16px;
                        height: 16px;
                        border: 2px solid rgba(0, 0, 0, .3);
                        border-radius: 50%;
                        border-top-color: #007acc;
                        animation: spin 1s ease-in-out infinite;
                    }
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                    pre { background: #2d2d2d; color: #ffffff; padding: 10px; border-radius: 5px; }
                    .text-section { margin-bottom: 20px; }
                </style>
            </head>
            <body>
                <h1>Personal Co-Pilot</h1>
                <p>Highlight some code to get some AI feedback</p>
                ${conversationHtml} <!-- Render the entire conversation history -->
                ${loadingHtml} <!-- Show loading indicator if isLoading is true -->
            </body>
            </html>`;
    }

    formatText(text: string): string {
        return text
            .replace(/```(.*?)```/gs, '<pre class="code-block">$1</pre>') // Format code blocks
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')     
            .replace(/\`(.*?)\`/g, '<b>$1</b>')    
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')    
            .replace(/\n/g, '<br>');  // Preserve line breaks for plain text
    }
}

// This method is called when your extension is deactivated
export function deactivate() {}
