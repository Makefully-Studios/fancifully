export type EditorChromeHandlers = {
  onToggleEdit: () => void;
  onAddPage: () => void;
  onRemovePage: () => void;
  onFrontCoverChange: (enabled: boolean) => void;
  onBackCoverChange: (enabled: boolean) => void;
  onHardbackChange: (enabled: boolean) => void;
  onDownload: () => void;
};

export type EditorChromeState = {
  editing: boolean;
  frontCover: boolean;
  backCover: boolean;
  hardback: boolean;
  canRemovePage: boolean;
};

/**
 * Corner Edit / Preview toggle + toolbar (add/remove page, cover toggles, download).
 */
export class EditorChrome {
  readonly element: HTMLElement;
  private toggleBtn: HTMLButtonElement;
  private toolbar: HTMLElement;
  private frontCoverInput: HTMLInputElement;
  private backCoverInput: HTMLInputElement;
  private hardbackInput: HTMLInputElement;
  private removeBtn: HTMLButtonElement;
  private handlers: EditorChromeHandlers;

  constructor(handlers: EditorChromeHandlers) {
    this.handlers = handlers;

    this.element = document.createElement('div');
    this.element.className = 'fc-editor-chrome';

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.type = 'button';
    this.toggleBtn.className = 'fc-editor-toggle';
    this.toggleBtn.textContent = 'Edit';
    this.toggleBtn.setAttribute('aria-pressed', 'false');
    this.toggleBtn.addEventListener('click', () => this.handlers.onToggleEdit());

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'fc-editor-toolbar';
    this.toolbar.hidden = true;

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'fc-editor-btn';
    addBtn.textContent = 'Add page';
    addBtn.addEventListener('click', () => this.handlers.onAddPage());

    this.removeBtn = document.createElement('button');
    this.removeBtn.type = 'button';
    this.removeBtn.className = 'fc-editor-btn';
    this.removeBtn.textContent = 'Remove page';
    this.removeBtn.addEventListener('click', () => this.handlers.onRemovePage());

    const frontLabel = document.createElement('label');
    frontLabel.className = 'fc-editor-check';
    this.frontCoverInput = document.createElement('input');
    this.frontCoverInput.type = 'checkbox';
    this.frontCoverInput.addEventListener('change', () => {
      this.handlers.onFrontCoverChange(this.frontCoverInput.checked);
    });
    frontLabel.append(this.frontCoverInput, document.createTextNode(' Front cover'));

    const backLabel = document.createElement('label');
    backLabel.className = 'fc-editor-check';
    this.backCoverInput = document.createElement('input');
    this.backCoverInput.type = 'checkbox';
    this.backCoverInput.addEventListener('change', () => {
      this.handlers.onBackCoverChange(this.backCoverInput.checked);
    });
    backLabel.append(this.backCoverInput, document.createTextNode(' Back cover'));

    const hardbackLabel = document.createElement('label');
    hardbackLabel.className = 'fc-editor-check';
    this.hardbackInput = document.createElement('input');
    this.hardbackInput.type = 'checkbox';
    this.hardbackInput.addEventListener('change', () => {
      this.handlers.onHardbackChange(this.hardbackInput.checked);
    });
    hardbackLabel.append(this.hardbackInput, document.createTextNode(' Hardback'));

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'fc-editor-btn fc-editor-btn-download';
    downloadBtn.textContent = 'Download book';
    downloadBtn.addEventListener('click', () => this.handlers.onDownload());

    this.toolbar.append(addBtn, this.removeBtn, frontLabel, backLabel, hardbackLabel, downloadBtn);
    this.element.append(this.toggleBtn, this.toolbar);
  }

  setState(state: EditorChromeState): void {
    this.toggleBtn.textContent = state.editing ? 'Preview' : 'Edit';
    this.toggleBtn.setAttribute('aria-pressed', String(state.editing));
    this.toggleBtn.classList.toggle('is-active', state.editing);
    this.toolbar.hidden = !state.editing;
    this.frontCoverInput.checked = state.frontCover;
    this.backCoverInput.checked = state.backCover;
    this.hardbackInput.checked = state.hardback;
    this.removeBtn.disabled = !state.canRemovePage;
  }

  destroy(): void {
    this.element.remove();
  }
}
