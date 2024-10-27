import * as vscode from 'vscode';
import { Ollama } from 'ollama'
import { HfInference } from '@huggingface/inference';

interface Models {
  label: string,
  description: string
}

let conversationHistory: { userInput: string, aiResponse: string }[] = []; // Array to store the conversation history

// List of models to choose from
const models: Models[] = [
  { label: 'llama3.2:3b', description: 'Llama3.2 3B' },
  { label: 'deepseek-coder-v2:16b', description: 'DeepSeek Coder 16B' },
  { label: 'qwen2.5-coder:7b', description: 'Qwen2.5 Coder 7B' }, // Add more models as needed
  { label: 'granite3-moe:3b', description: 'IBM Granite3 Moe 3B ' }, // Add more models as needed

];

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

    const ANNOTATION_PROMPT = `You are an AI code assistant designed to help developers write, debug, and improve code. Your primary responsibilities are:
    1. **Code Explanation**: When a user asks you to explain a piece of code, provide a clear, concise explanation that covers the logic, flow, and purpose of the code. If appropriate, mention potential issues or improvements.
    2. **Code Suggestions**: When a user provides a code snippet, suggest improvements in terms of readability, performance, maintainability, and adherence to best coding practices. Offer code refactoring suggestions if needed, with reasons for your recommendations.
    3. **Error Debugging**: When a user provides an error or bug, help them troubleshoot by identifying potential causes, offering steps to debug, and suggesting fixes. Always reference common pitfalls associated with the error if applicable.
    4. **Language Awareness**: Adapt your suggestions to the programming language being used. Whether it’s Python, JavaScript, Java, C#, or any other language, ensure that the solutions you offer follow the best practices of that language and are idiomatic. 
    5. **Learning Guidance**: Understand that developers may have different levels of experience. Provide beginner-friendly explanations when necessary, and include advanced tips or references for more experienced users.
    6. **Code Completion**: When asked to complete a snippet, continue the code in a way that solves the user's problem while maintaining the coding style and structure already present in their snippet.
    7. **Documentation & Libraries**: Offer relevant information about functions, libraries, and tools being used. If appropriate, suggest using external libraries or tools to improve the implementation or efficiency. 
    8. **Error Handling and Edge Cases**: Make sure that the code you suggest includes proper error handling and considers edge cases where applicable.
    9. **Comments and Documentation**: Encourage the use of comments and self-documenting code. Provide short comments in your code examples to help users understand what each section does.
    10. **User Interaction**: Ask clarifying questions if the problem or code snippet isn’t clear, and encourage the user to provide more context if needed.
    11. **Maintain Positive Tone**: Always provide feedback in a friendly, constructive, and supportive manner. Ensure that your suggestions feel like guidance rather than criticism.
    Remember that your goal is not only to solve the immediate issue but also to help the user become a better developer by sharing best practices and insights.
    ` 
    let selectModel = vscode.commands.registerCommand('code-edit-qwen25.selectModel', async () => {
      const pickedModel = await vscode.window.showQuickPick(models, {
        placeHolder: 'Select a model for code generation',
      });
    
      if (pickedModel && typeof pickedModel.label === 'string') {
        selectedModel = pickedModel.label;  // Ensure selectedModel is a string
        vscode.window.showInformationMessage(`Model changed to ${pickedModel.description}`);
      } else {
        vscode.window.showErrorMessage('Invalid model selection');
      }
    });

    let refactorCode = vscode.commands.registerTextEditorCommand('code-edit-qwen25.refactor', async (editor) => {
      const userMessage = editor.document.getText(editor.selection);
      const inputs = `Refactor the following code to improve readability, performance, and maintainability. 
      Please return only the refactored code, with inline comments explaining each change, in JavaScript format:
      ${userMessage}`;
      
      const response = await ollama.generate({
        model: selectedModel,
        prompt: inputs,
        options: {
            temperature: 0.7,                 // Control response randomness
            top_p: 0.9,                       // Set to balance diversity and focus
        }
      })

      let data = response.response
      data = data.replace(/```[a-zA-Z]*|```/g, "");
      data = data.replace(/^(\d\.\s)/gm, '// $1');

      editor.edit(editBuilder => {
          vscode.window.showInformationMessage(`Respnse details: ${response.response}`);
          editBuilder.replace(editor.selection, data);
      });
  });

  let editWhileType = vscode.workspace.onDidChangeTextDocument(async (event) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || event.document !== editor.document) return;

    const position = editor.selection.active;
    const lineText = editor.document.lineAt(position.line).text.substring(0, position.character);
    const inputs = `Refactor the following code to improve readability, performance, and maintainability. 
    Please only return code that would be the next logical step, no comments`

    try {
        const newResponse = await ollama.generate({
            model: selectedModel,
            prompt: inputs + lineText,
            options: {
                temperature: 0.7,
                top_p: 0.9,
            },
        });

        const generatedMessage = newResponse.response;
        
        // Insert the suggestion as a completion item
        const completionItem = new vscode.CompletionItem(generatedMessage, vscode.CompletionItemKind.Snippet);
        completionItem.range = new vscode.Range(position, position);
        completionItem.insertText = generatedMessage;

        // Show completion item in the editor
        vscode.languages.registerCompletionItemProvider('*', {
            provideCompletionItems() {
                return [completionItem];
            },
        });
        vscode.commands.executeCommand('textGenerationView.update', conversationHistory, false);

    } catch (error: any) {
        vscode.window.showErrorMessage(`Error generating code completion: ${error.message}`);
    }
});

    // Create a webview for text generation inside the new sidebar
    vscode.window.registerWebviewViewProvider('textGenerationView', new TextGenerationViewProvider(context, inference));

    let disposable = vscode.commands.registerCommand('code-edit-qwen25.helloWorld', async () => {
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

    context.subscriptions.push(editWhileType, refactorCode, disposable, selectModel);
}

let suggestionCount = 0;

const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
statusBarItem.text = `AI Suggestions: ${suggestionCount}`;
statusBarItem.show();

// Each time a suggestion is made, increment the counter
suggestionCount++;
statusBarItem.text = `AI Suggestions: ${suggestionCount}`;

// Function to filter out the ANNOTATION_PROMPT and userMessage from the AI's response
function filterAIResponse(generatedMessage: string, userMessage: string, annotationPrompt?: string): string {
  let filteredResponse = generatedMessage;

  // Remove the ANNOTATION_PROMPT if present
  if (annotationPrompt && filteredResponse.startsWith(annotationPrompt)) {
      filteredResponse = filteredResponse.substring(annotationPrompt.length).trim();
  }

  // Remove the user input if present in the response
  if (filteredResponse.includes(userMessage) || filteredResponse.startsWith(userMessage)) {
      filteredResponse = filteredResponse.substring(userMessage.length).trim();
  }

  return filteredResponse;
}

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
                    <p class="user-input">${formattedUserMessage}</p>
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
