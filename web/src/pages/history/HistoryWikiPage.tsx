import { useEffect, useState } from 'react';
import { EditOutlined, PaperClipOutlined, SearchOutlined } from '@ant-design/icons';
import { App, Button, Checkbox, Drawer, Empty, Form, Input, List, Space, Tag } from 'antd';
import { historyApi } from '../../api/history';
import type { HistoryContribution, HistoryEntry } from '../../types/history';
import { historyContributionStatusColor, historyContributionStatusText } from './historyState';
import './history-wiki.css';

const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export function HistoryWikiPage() {
  const { message } = App.useApp();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [mine, setMine] = useState<HistoryContribution[]>([]);
  const [active, setActive] = useState<HistoryEntry | null>(null);
  const [keyword, setKeyword] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [form] = Form.useForm();

  const load = async (search = keyword) => {
    try {
      const [entryItems, contributions] = await Promise.all([
        historyApi.listEntries(search.trim() || undefined),
        historyApi.listMine(),
      ]);
      setEntries(entryItems);
      setMine(contributions);
      setActive(
        (current) => entryItems.find((item) => item.id === current?.id) ?? entryItems[0] ?? null,
      );
    } catch (error) {
      message.error(error instanceof Error ? error.message : '院史内容加载失败');
    }
  };
  useEffect(() => {
    void load(''); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseFiles = (fileList: FileList | null) => {
    const selected = Array.from(fileList ?? []);
    if (selected.some((file) => !allowedTypes.includes(file.type)))
      return void message.error('仅支持 JPG、PNG、WebP、PDF 文件');
    if (selected.some((file) => file.size > 10 * 1024 * 1024))
      return void message.error('单个附件不能超过 10 MB');
    if (files.length + selected.length > 6) return void message.error('每次投稿最多上传 6 个附件');
    setFiles((current) => [...current, ...selected]);
  };
  const submit = async () => {
    try {
      const values = await form.validateFields();
      if (files.length && !consent)
        return void message.warning('上传图片或扫描件前，请确认来源和授权说明');
      const draft = await historyApi.createDraft({ entry_id: active?.id, ...values });
      for (const file of files)
        await historyApi.uploadAttachment(draft.id, file, {
          description: file.name,
          source_note: values.source_note,
          rights_note: values.rights_note || '投稿人确认有权提交',
          consent_confirmed: consent,
        });
      await historyApi.submit(draft.id);
      message.success('资料已提交，审核通过后才会更新正式词条。');
      form.resetFields();
      setFiles([]);
      setConsent(false);
      setDrawerOpen(false);
      await load();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) return;
      message.error(error instanceof Error ? error.message : '提交失败，请稍后重试');
    }
  };

  return (
    <section className="history-page">
      <header className="history-page__header">
        <div>
          <span>院史共编</span>
          <h1>留存共同的学院记忆</h1>
          <p>查阅正式词条，补充可核验的院史资料。每一次投稿均需审核。</p>
        </div>
        <Space>
          <Input
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onPressEnter={() => void load()}
            placeholder="搜索已发布词条"
          />
          <Button onClick={() => void load()}>搜索</Button>
          <Button type="primary" icon={<EditOutlined />} onClick={() => setDrawerOpen(true)}>
            参与编写
          </Button>
        </Space>
      </header>
      <main className="history-page__content">
        <aside>
          <strong>院史目录</strong>
          <small>{entries.length} 个词条</small>
          <List
            size="small"
            dataSource={entries}
            renderItem={(entry) => (
              <List.Item
                className={entry.id === active?.id ? 'active' : ''}
                onClick={() => setActive(entry)}
              >
                {entry.title}
                <small>v{entry.current_version}</small>
              </List.Item>
            )}
          />
        </aside>
        <article>
          <Tag color="red">正式词条</Tag>
          <h2>{active?.title ?? '暂无已发布词条'}</h2>
          <p className="history-page__summary">
            {active?.summary ?? '校友可提交经过核验的院史资料。'}
          </p>
          <div className="history-page__meta">
            已审核版本 · {active ? `v${active.current_version}` : '等待首个版本'}
          </div>
          <h3>词条正文</h3>
          <p className="history-page__body">{active?.content ?? '暂时没有内容。'}</p>
          <h3>参考资料</h3>
          <p>图片、扫描件和资料来源会在审核通过后随正式版本展示。</p>
        </article>
        <aside>
          <strong>我的投稿</strong>
          <p>仅显示当前登录校友的投稿记录。</p>
          <List
            dataSource={mine}
            locale={{
              emptyText: <Empty description="还没有投稿" image={Empty.PRESENTED_IMAGE_SIMPLE} />,
            }}
            renderItem={(item) => (
              <List.Item>
                <div>
                  <Tag color={historyContributionStatusColor[item.status]}>
                    {historyContributionStatusText[item.status]}
                  </Tag>
                  <b>{item.title}</b>
                  <p>{item.review_comment || item.change_note || '等待审核'}</p>
                </div>
              </List.Item>
            )}
          />
        </aside>
      </main>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
        title="提交院史资料"
        footer={
          <Space>
            <Button onClick={() => setDrawerOpen(false)}>取消</Button>
            <Button type="primary" onClick={() => void submit()}>
              提交审核
            </Button>
          </Space>
        }
      >
        <p className="history-page__notice">提交后会进入审核，不会直接修改正式词条。</p>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ title: active?.title, section_name: '词条正文' }}
        >
          <Form.Item name="title" label="词条标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="section_name" label="编辑章节">
            <Input />
          </Form.Item>
          <Form.Item name="content" label="正文" rules={[{ required: true }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
          <Form.Item name="source_note" label="资料来源" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="请注明资料出处" />
          </Form.Item>
          <Form.Item name="change_note" label="修改说明">
            <Input />
          </Form.Item>
          <Form.Item name="rights_note" label="附件授权说明">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div className="history-page__upload">
            <PaperClipOutlined />
            <div>
              <b>图片和扫描件</b>
              <p>支持 JPG、PNG、WebP、PDF；单个不超过 10 MB；每次最多 6 个。</p>
              <input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => {
                  chooseFiles(event.target.files);
                  event.currentTarget.value = '';
                }}
              />
              {files.map((file) => (
                <div key={`${file.name}-${file.size}`}>
                  {file.name}{' '}
                  <Button
                    type="link"
                    danger
                    onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                  >
                    移除
                  </Button>
                </div>
              ))}
              <Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)}>
                我确认附件来源真实且有权提交。
              </Checkbox>
            </div>
          </div>
        </Form>
      </Drawer>
    </section>
  );
}
