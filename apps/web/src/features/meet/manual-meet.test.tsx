import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ManualMeetField } from './ManualMeetField';
import { isManualMeetUrl } from './manual-meet';
afterEach(cleanup);
describe('Manual Meet entry', () => {
  it.each(['https://meet.google.com/abc-defg-hij','https://meet.google.com/xyz-abcd-efg'])('accepts exact room URL %s', value => expect(isManualMeetUrl(value)).toBe(true));
  it.each(['http://meet.google.com/abc-defg-hij','https://meet.google.com.evil.invalid/abc-defg-hij','https://user@meet.google.com/abc-defg-hij','https://meet.google.com/abc-defg-hij?authuser=1','https://meet.google.com/abc-defg-hij#secret','https://meet.google.com/new',' https://meet.google.com/abc-defg-hij','javascript:alert(1)'])('rejects unsafe or non-room URL %s', value => expect(isManualMeetUrl(value)).toBe(false));
  it('offers external creation and blocks unsafe values with a useful inline error', () => {
    render(<ManualMeetField label="Link Meet thủ công" />);
    expect(screen.getByRole('link',{name:/tạo phòng/})).toHaveAttribute('href','https://meet.google.com');
    const field=screen.getByLabelText('Link Meet thủ công') as HTMLInputElement;
    fireEvent.change(field,{target:{value:'https://evil.invalid/abc-defg-hij'}});
    expect(field.checkValidity()).toBe(false);
    fireEvent.invalid(field);
    expect(screen.getByRole('alert')).toHaveTextContent('không kèm tham số');
    fireEvent.change(field,{target:{value:'https://meet.google.com/abc-defg-hij'}});
    expect(field.checkValidity()).toBe(true);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
