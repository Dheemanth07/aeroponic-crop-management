import { traysRepository, TraysRepository } from './trays.repo.js';
import { CreateTrayInput } from './trays.schema.js';
import { NotFoundError, ConflictError } from '../../plugins/error-handler.js';
import { Tray } from '../../types/index.js';

export class TraysService {
  constructor(private repo: TraysRepository = traysRepository) {}

  async createTray(input: CreateTrayInput): Promise<Tray> {
    // Check if code is already in use
    const existing = await this.repo.findByCode(input.code);
    if (existing) {
      throw new ConflictError(`Tray code '${input.code}' already exists`);
    }

    return this.repo.create(input.code, input.zone, input.capacity_units);
  }

  async getAllTrays(): Promise<Tray[]> {
    return this.repo.findAll();
  }

  async getTrayById(id: string): Promise<Tray> {
    const tray = await this.repo.findById(id);
    if (!tray) {
      throw new NotFoundError(`Tray with ID '${id}' not found`);
    }
    return tray;
  }
}

export const traysService = new TraysService();
