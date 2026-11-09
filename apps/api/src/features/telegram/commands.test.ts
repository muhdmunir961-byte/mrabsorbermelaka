import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from './commands.js';

describe('parseCommand', () => {
  it('reads a command and its arguments', () => {
    assert.deepEqual(parseCommand('/nama +60123456789 Ali bin Abu'), {
      command: 'nama',
      args: ['+60123456789', 'Ali', 'bin', 'Abu'],
    });
  });

  it('ignores the bot suffix Telegram adds in groups', () => {
    // In a group the client rewrites /status to /status@mrabsorbermelaka_bot.
    assert.deepEqual(parseCommand('/status@mrabsorbermelaka_bot +60123456789'), {
      command: 'status',
      args: ['+60123456789'],
    });
  });

  it('is case insensitive', () => {
    assert.equal(parseCommand('/SENARAI')?.command, 'senarai');
  });

  it('tolerates extra whitespace', () => {
    assert.deepEqual(parseCommand('   /pekerja    +60123456789   '), {
      command: 'pekerja',
      args: ['+60123456789'],
    });
  });

  it('leaves /start alone so the sign-in flow still runs', () => {
    assert.equal(parseCommand('/start'), null);
    assert.equal(parseCommand('/start abc123'), null);
  });

  it('ignores ordinary chat text', () => {
    assert.equal(parseCommand('selamat pagi'), null);
  });

  it('ignores unknown commands', () => {
    assert.equal(parseCommand('/padam semua'), null);
  });

  it('returns no arguments for a bare command', () => {
    assert.deepEqual(parseCommand('/bantuan'), { command: 'bantuan', args: [] });
  });
});
