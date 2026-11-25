import {afterEach,describe,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {MemoryRouter} from 'react-router';
import {ConsultationDay,type ConsultationBooking} from './ConsultationsPage';
afterEach(cleanup);
const booking:ConsultationBooking={id:'b1',teacherId:'t1',startsAt:'2026-11-10T17:15:00Z',endsAt:'2026-11-10T17:45:00Z',state:'CONFIRMED',expiresAt:null,topic:'Private learner topic',displayName:'Approved public name',profileNumber:1,version:1,joinUrl:null,changes:null,reports:null};
describe('W05B private month projection',()=>{
 it('places an actual booking on the Vietnam day and links to the private workspace',()=>{
  render(<MemoryRouter><ConsultationDay day="2026-11-11" bookings={[booking]}/></MemoryRouter>);
  expect(screen.getByRole('link',{name:/Tư vấn 1:1/})).toHaveAttribute('href','/consultations');
  expect(screen.queryByText('Private learner topic')).not.toBeInTheDocument();
 });
 it('does not show a booking on another Vietnam date',()=>{
  render(<MemoryRouter><ConsultationDay day="2026-11-10" bookings={[booking]}/></MemoryRouter>);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
 });
 it('excludes cancelled and superseded reservations on their actual date',()=>{
  const rows=[{...booking,id:'b2',state:'CANCELLED'},{...booking,id:'b3',state:'SUPERSEDED'}];
  render(<MemoryRouter><ConsultationDay day="2026-11-11" bookings={rows}/></MemoryRouter>);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
 });
});
