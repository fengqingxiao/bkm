import Phaser from 'phaser';

const BOX_WIDTH = 608;
const BOX_HEIGHT = 128;
const LINE_HEIGHT = 26;
const PADDING = 12;

export class MessageBox {
  private container: Phaser.GameObjects.Container;
  private text: Phaser.GameObjects.Text;
  private cursor: Phaser.GameObjects.Text;
  private choiceTexts: Phaser.GameObjects.Text[] = [];
  private choiceIndex = 0;

  constructor(private scene: Phaser.Scene) {
    const g = scene.add.graphics();
    g.fillStyle(0x10243c, 0.92);
    g.fillRect(0, 0, BOX_WIDTH, BOX_HEIGHT);
    g.lineStyle(2, 0xdfe9ff, 0.9);
    g.strokeRect(1, 1, BOX_WIDTH - 2, BOX_HEIGHT - 2);

    this.text = scene.add.text(PADDING, PADDING, '', {
      fontFamily: '"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '17px',
      color: '#ffffff',
      wordWrap: { width: BOX_WIDTH - PADDING * 2, useAdvancedWrap: true },
      lineSpacing: 4,
    });
    this.cursor = scene.add.text(BOX_WIDTH - 22, BOX_HEIGHT - 26, '▼', { fontSize: '14px', color: '#ffdd66' });
    this.container = scene.add
      .container(16, this.scene.scale.height - BOX_HEIGHT - 12, [g, this.text, this.cursor])
      .setScrollFactor(0)
      .setDepth(2_000_000)
      .setVisible(false);

    scene.scale.on('resize', () => this.layout());
  }

  private layout(): void {
    this.container?.setPosition(16, this.scene.scale.height - BOX_HEIGHT - 12);
  }

  private setLines(lines: string[]): void {
    this.text.setText(lines.slice(0, 4).join('\n'));
  }

  async show(lines: string[], waitForAction: () => Promise<unknown>): Promise<void> {
    this.container.setVisible(true);
    this.clearChoices();
    this.setLines(lines);
    this.cursor.setVisible(true);
    await waitForAction();
    this.cursor.setVisible(false);
    this.container.setVisible(false);
  }

  async choose(options: string[], cancelType: number, waitForAction: () => Promise<'ok' | 'cancel' | 'up' | 'down'>): Promise<number> {
    this.container.setVisible(true);
    this.cursor.setVisible(false);
    this.choiceIndex = 0;
    const startY = this.scene.scale.height - BOX_HEIGHT - 12 - options.length * LINE_HEIGHT - 12;
    this.choiceTexts = options.map((opt, i) =>
      this.scene.add
        .text(0, 0, opt, {
          fontFamily: '"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: '17px',
          color: '#ffffff',
        })
        .setScrollFactor(0)
        .setDepth(2_000_001),
    );
    const width = 160;
    const x = 24;
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(2_000_000);
    g.fillStyle(0x10243c, 0.94);
    g.fillRect(x - 8, startY - 6, width, options.length * LINE_HEIGHT + 12);
    g.lineStyle(2, 0xdfe9ff, 0.9);
    g.strokeRect(x - 7, startY - 5, width - 2, options.length * LINE_HEIGHT + 10);
    this.choiceTexts.forEach((t, i) => t.setPosition(x + 8, startY + i * LINE_HEIGHT));
    const mark = this.scene.add.text(x - 2, startY, '▶', { fontSize: '13px', color: '#ffdd66' }).setScrollFactor(0).setDepth(2_000_002);

    const paint = () => mark.setY(startY + this.choiceIndex * LINE_HEIGHT);

    paint();
    for (;;) {
      const action = await waitForAction();
      if (action === 'up') {
        this.choiceIndex = (this.choiceIndex + options.length - 1) % options.length;
        paint();
      } else if (action === 'down') {
        this.choiceIndex = (this.choiceIndex + 1) % options.length;
        paint();
      } else if (action === 'ok') {
        break;
      } else if (action === 'cancel' && cancelType !== 3) {
        this.choiceIndex = -1;
        break;
      }
    }

    this.clearChoices();
    g.destroy();
    mark.destroy();
    this.container.setVisible(false);
    return this.choiceIndex;
  }

  private clearChoices(): void {
    for (const t of this.choiceTexts) t.destroy();
    this.choiceTexts = [];
  }
}
