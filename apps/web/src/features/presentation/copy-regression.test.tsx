import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { apiFetch } from '@/lib/api-client';
import { ToastProvider } from '@/components/ui/Feedback';
import { SePayPaymentsPage } from '@/pages/SePayPaymentsPage';
import { SourceRecord } from '@/features/catalog/SourceRecord';

vi.mock('@/lib/api-client', async (original) => ({
  ...(await original<typeof import('@/lib/api-client')>()),
  apiFetch: vi.fn(),
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const context: AuthContextValue = {
  user: {id:'copy-owner',fullName:'Learner',email:'copy@example.invalid',role:'STUDENT',status:'ACTIVE'},
  isLoading:false,error:null,login:vi.fn(),register:vi.fn(),logout:vi.fn(),refreshUser:vi.fn(),
};
function payment() {
  // Deliberately different from the protected QA order: values must come from the response.
  vi.mocked(apiFetch).mockResolvedValue({viewerId:'copy-owner',configuration:'VERIFIED',sourceReason:'',eligibleObligations:[],orders:[{
    id:'copy-order',obligationId:'copy-obligation',code:'COPY-UNIT-REFERENCE',amountVnd:372000,state:'PENDING',qrUrl:null,
    recipient:{bankCode:'UNIT',accountNumber:'123456789',accountHolder:'Unit recipient'},
  }]});
  render(<MemoryRouter><AuthContext.Provider value={context}><ToastProvider><SePayPaymentsPage /></ToastProvider></AuthContext.Provider></MemoryRouter>);
}

describe('Vietnamese copy with real UI behavior (offline doubles; no QA writes)',()=>{
  it('copies each server value with descriptive names and leaves the order pending',async()=>{
    const writeText=vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator',Object.create(navigator,{clipboard:{value:{writeText},configurable:true}}));
    payment();
    fireEvent.click(await screen.findByRole('button',{name:'Sao chép số tài khoản'}));
    await waitFor(()=>expect(writeText).toHaveBeenNthCalledWith(1,'123456789'));
    fireEvent.click(screen.getByRole('button',{name:'Sao chép nội dung chuyển khoản'}));
    await waitFor(()=>expect(writeText).toHaveBeenNthCalledWith(2,'COPY-UNIT-REFERENCE'));
    expect(screen.getByText('Chờ chuyển khoản')).toBeInTheDocument();
    expect(screen.queryByText('Đã xác nhận tiền vào')).not.toBeInTheDocument();
    expect(vi.mocked(apiFetch).mock.calls.every(([,init])=>!init?.method || init.method==='GET')).toBe(true);
  });
  it('announces clipboard failure without claiming payment or copy success',async()=>{
    const writeText=vi.fn().mockRejectedValue(new Error('Permission denied'));
    vi.stubGlobal('navigator',Object.create(navigator,{clipboard:{value:{writeText},configurable:true}}));
    payment();
    fireEvent.click(await screen.findByRole('button',{name:'Sao chép số tài khoản'}));
    expect(await screen.findByText(/Không thể sao chép tự động/)).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Đã chép số tài khoản'})).not.toBeInTheDocument();
    expect(screen.getByText('Chờ chuyển khoản')).toBeInTheDocument();
  });
  it('retains the truthful QA disclosure and original record name',()=>{
    render(<SourceRecord name="W02B TOEIC Foundation" code="QA-DEC071-LR-01" />);
    const summary=screen.getByText('Tên gốc và dữ liệu thử nghiệm (QA)');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(summary.closest('details')).toHaveTextContent('W02B TOEIC Foundation');
    expect(summary.closest('details')).toHaveTextContent('QA-DEC071-LR-01');
  });
});
