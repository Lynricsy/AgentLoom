import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthLayout } from '../AuthLayout';

describe('AuthLayout', () => {
  it('渲染 AgentLoom logo 和标语', () => {
    render(<AuthLayout>test content</AuthLayout>);

    expect(screen.getByText('AL')).toBeInTheDocument();
    expect(screen.getByText('AgentLoom')).toBeInTheDocument();
    expect(screen.getByText('多智能体工作流编排平台')).toBeInTheDocument();
  });

  it('渲染 children', () => {
    render(
      <AuthLayout>
        <div data-testid="child">child content</div>
      </AuthLayout>,
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('child content')).toBeInTheDocument();
  });

  it('支持自定义 className', () => {
    const { container } = render(
      <AuthLayout className="custom-class">content</AuthLayout>,
    );

    const wrapper = container.querySelector('.custom-class');
    expect(wrapper).toBeInTheDocument();
  });
});
