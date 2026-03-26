import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { CreateTipDto } from '../src/tips/create-tips.dto';

describe('Tip Metadata Validation (DTO Unit Test)', () => {
  let validationPipe: ValidationPipe;

  beforeEach(async () => {
    validationPipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
  });

  const validTipBase: CreateTipDto = {
    artistId: '550e8400-e29b-41d4-a716-446655440001',
    stellarTxHash: 'c6e0b3e5c8a4f2d1b9a7e6f3c5d8a2b1c4e7f0a9b3d6e9f2c5a8b1e4f7a0c3d6',
  } as CreateTipDto;

  it('should accept valid metadata', async () => {
    const dto = {
      ...validTipBase,
      metadata: {
        source: 'web',
        campaign: 'ref-code-123',
      },
    };

    // To test validation pipe manually, we need some metadata
    const metadata = {
      type: 'body',
      metatype: CreateTipDto,
      data: '',
    } as any;

    const transformed = await validationPipe.transform(dto, metadata);
    expect(transformed.metadata.source).toBe('web');
  });

  it('should fail if metadata field exceeds MaxLength', async () => {
    const dto = {
      ...validTipBase,
      metadata: {
        source: 'a'.repeat(51), // Max is 50
      },
    };

    const metadata = {
      type: 'body',
      metatype: CreateTipDto,
      data: '',
    } as any;

    try {
      await validationPipe.transform(dto, metadata);
      throw new Error('Should have thrown BadRequestException');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const response = e.getResponse();
      expect(response.message).toContain('metadata.source must be shorter than or equal to 50 characters');
    }
  });

  it('should fail if metadata contains unknown fields', async () => {
    const dto = {
      ...validTipBase,
      metadata: {
        unknown: 'value',
      },
    };

    const metadata = {
      type: 'body',
      metatype: CreateTipDto,
      data: '',
    } as any;

    try {
      await validationPipe.transform(dto, metadata);
      throw new Error('Should have thrown BadRequestException');
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      const response = e.getResponse();
      expect(response.message).toContain('metadata.property unknown should not exist');
    }
  });
});
