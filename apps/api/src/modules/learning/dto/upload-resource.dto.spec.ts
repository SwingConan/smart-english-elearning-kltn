import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UploadResourceDto } from './upload-resource.dto';

describe('UploadResourceDto', () => {
  it.each([['true', true], ['false', false]])('transforms multipart isDownloadable=%s', async (input, expected) => {
    const dto = plainToInstance(UploadResourceDto, { title: ' Tài liệu ', isDownloadable: input });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.title).toBe('Tài liệu');
    expect(dto.isDownloadable).toBe(expected);
  });

  it('rejects invalid boolean and requires a revision when replacing', async () => {
    const dto = plainToInstance(UploadResourceDto, {
      isDownloadable: 'yes', replaceResourceId: '80000000-0000-4000-8000-000000000001',
    });
    const errors = await validate(dto);
    expect(errors.map(({ property }) => property)).toEqual(expect.arrayContaining(['isDownloadable', 'expectedUpdatedAt']));
  });
});
